import os
import hmac
import threading
import time
import uuid
from typing import List

import modal
from fastapi import HTTPException, Request
from pydantic import BaseModel

from prompts import LYRICS_GENERATOR_PROMPT, PROMPT_GENERATOR_PROMPT

app = modal.App("music-generator")

# The cloud computer: Python 3.12, git, ffmpeg, your packages, ACE-Step
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "ffmpeg")
    .pip_install_from_requirements("requirements.txt")
    .pip_install("fastapi[standard]", "boto3")
    .run_commands([
        "git clone --depth 1 https://github.com/ace-step/ACE-Step.git /tmp/ACE-Step",
        "cd /tmp/ACE-Step && pip install .",
    ])
    .pip_install("diffusers==0.33.1", "torchcodec")
    .add_local_python_source("prompts")  # copies prompts.py into the cloud
)

# Saved folders in the cloud
model_volume = modal.Volume.from_name("ace-step-models", create_if_missing=True)
hf_volume = modal.Volume.from_name("qwen-hf-cache", create_if_missing=True)
output_volume = modal.Volume.from_name("music-outputs", create_if_missing=True)

# Must contain: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME
music_gen_secrets = modal.Secret.from_name("music-gen-secret")


# ---------- request / response shapes ----------
class AudioGenerationBase(BaseModel):
    audio_duration: float = 180.0
    seed: int = -1
    guidance_scale: float = 15.0
    infer_step: int = 60
    instrumental: bool = False


class GenerateFromDescriptionRequest(AudioGenerationBase):
    full_described_song: str


class GenerateWithCustomLyricsRequest(AudioGenerationBase):
    prompt: str
    lyrics: str


class GenerateWithDescribedLyricsRequest(AudioGenerationBase):
    prompt: str
    described_lyrics: str


class GenerateMusicResponseS3(BaseModel):
    s3_key: str
    cover_image_s3_key: str
    categories: List[str]


def log(message: str):
    """Progress message from the cloud server."""
    print(f"[server] {message}", flush=True)


def require_generation_token(request: Request):
    expected_token = os.environ.get("GENERATION_API_TOKEN")
    authorization = request.headers.get("authorization", "")
    scheme, _, supplied_token = authorization.partition(" ")
    if (
        not expected_token
        or scheme.lower() != "bearer"
        or not supplied_token
        or not hmac.compare_digest(supplied_token, expected_token)
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")


# ---------- the server (runs on the cloud GPU) ----------
@app.cls(
    image=image,
    gpu="L40S",
    volumes={
        "/models": model_volume,
        "/.cache/huggingface": hf_volume,
        "/outputs": output_volume,
    },
    secrets=[music_gen_secrets],
    scaledown_window=60,
    timeout=1800,
)
class MusicGenServer:

    @modal.enter()
    def load_model(self):
        t0 = time.time()
        from acestep.pipeline_ace_step import ACEStepPipeline
        from transformers import AutoTokenizer, AutoModelForCausalLM
        from diffusers import AutoPipelineForText2Image
        import torch

        # Music model
        self.music_model = ACEStepPipeline(
            checkpoint_dir="/models",
            dtype="bfloat16",
            torch_compile=False,
            cpu_offload=False,
            overlapped_decode=False,
        )

        # Lyrics / prompt writer
        model_id = "Qwen/Qwen2-7B-Instruct"
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_id, cache_dir="/.cache/huggingface"
        )
        self.llm_model = AutoModelForCausalLM.from_pretrained(
            model_id,
            torch_dtype="auto",
            device_map="auto",
            cache_dir="/.cache/huggingface",
        )

        # Cover art model
        self.image_pipe = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sdxl-turbo",
            torch_dtype=torch.float16,
            variant="fp16",
            cache_dir="/.cache/huggingface",
        )
        self.image_pipe.to("cuda")
        log(f"models ready ({time.time() - t0:.0f}s)")

    # ----- helpers that use Qwen -----
    def prompt_qwen(self, question: str) -> str:
        messages = [{"role": "user", "content": question}]
        text = self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        model_inputs = self.tokenizer([text], return_tensors="pt").to(
            self.llm_model.device
        )
        generated_ids = self.llm_model.generate(
            model_inputs.input_ids, max_new_tokens=512
        )
        generated_ids = [
            output_ids[len(input_ids):]
            for input_ids, output_ids in zip(model_inputs.input_ids, generated_ids)
        ]
        return self.tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]

    def generate_prompt(self, description: str) -> str:
        return self.prompt_qwen(PROMPT_GENERATOR_PROMPT.format(user_prompt=description))

    def generate_lyrics(self, description: str) -> str:
        return self.prompt_qwen(LYRICS_GENERATOR_PROMPT.format(description=description))

    def generate_categories(self, description: str) -> List[str]:
        prompt = (
            "Based on the following music description, list 3-5 relevant genres or "
            "categories as a comma-separated list. For example: Pop, Electronic, "
            f"Sad, 80s. Description: '{description}'"
        )
        response_text = self.prompt_qwen(prompt)
        return [c.strip() for c in response_text.split(",") if c.strip()]

    # ----- the main pipeline: song + cover + upload -----
    def generate_and_upload_to_s3(
        self,
        prompt: str,
        lyrics: str,
        instrumental: bool,
        audio_duration: float,
        infer_step: int,
        guidance_scale: float,
        seed: int,
        description_for_categorization: str,
    ) -> GenerateMusicResponseS3:
        import boto3  # imported here so your laptop doesn't need boto3

        final_lyrics = "[instrumental]" if instrumental else lyrics

        s3_client = boto3.client(
            "s3",
            region_name=os.environ.get("AWS_REGION")
            or os.environ.get("AWS_DEFAULT_REGION"),
        )
        bucket_name = os.environ["S3_BUCKET_NAME"]

        output_dir = "/tmp/outputs"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"{uuid.uuid4()}.wav")

        extra = {}
        if seed != -1:
            extra["manual_seeds"] = str(seed)

        # 1) make the song
        t0 = time.time()
        self.music_model(
            prompt=prompt,
            lyrics=final_lyrics,
            audio_duration=audio_duration,
            infer_step=infer_step,
            guidance_scale=guidance_scale,
            save_path=output_path,
            **extra,
        )
        log(f"song made ({time.time() - t0:.0f}s)")

        audio_s3_key = f"{uuid.uuid4()}.wav"
        s3_client.upload_file(output_path, bucket_name, audio_s3_key)
        os.remove(output_path)

        # 2) make the cover image
        thumbnail_prompt = f"{prompt}, album cover art"
        image = self.image_pipe(
            prompt=thumbnail_prompt, num_inference_steps=2, guidance_scale=0.0
        ).images[0]

        image_output_path = os.path.join(output_dir, f"{uuid.uuid4()}.png")
        image.save(image_output_path)

        image_s3_key = f"{uuid.uuid4()}.png"
        s3_client.upload_file(image_output_path, bucket_name, image_s3_key)
        os.remove(image_output_path)

        # 3) categories like "hip-hop", "rock"
        categories = self.generate_categories(description_for_categorization)
        log("song, cover and categories done")

        return GenerateMusicResponseS3(
            s3_key=audio_s3_key,
            cover_image_s3_key=image_s3_key,
            categories=categories,
        )

    # ----- simple test endpoint: saves the song in a volume, returns its name -----
    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def generate(self, request: Request):
        require_generation_token(request)
        os.makedirs("/outputs", exist_ok=True)
        filename = f"{uuid.uuid4()}.wav"

        self.music_model(
            prompt="electronic rap",
            lyrics="[verse]\nWaves on the bass, pulsing in the speakers\nTurn the dial up, we chasing six-figure features\n\n[chorus]\nElectro vibes, hearts beat with the hum\nUrban legends ride, we ain't ever numb",
            audio_duration=30,
            infer_step=60,
            guidance_scale=15,
            save_path=f"/outputs/{filename}",
        )

        output_volume.commit()  # makes the file visible for download
        log(f"test song saved: {filename}")
        return {"filename": filename}

    # ----- real endpoints (need S3 set up) -----
    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def generate_from_description(
        self, request: Request, body: GenerateFromDescriptionRequest
    ):
        require_generation_token(request)
        prompt = self.generate_prompt(body.full_described_song)

        lyrics = ""
        if not body.instrumental:
            lyrics = self.generate_lyrics(body.full_described_song)

        return self.generate_and_upload_to_s3(
            prompt=prompt,
            lyrics=lyrics,
            description_for_categorization=body.full_described_song,
            **body.model_dump(exclude={"full_described_song"}),
        )

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def generate_with_lyrics(
        self, request: Request, body: GenerateWithCustomLyricsRequest
    ):
        require_generation_token(request)
        return self.generate_and_upload_to_s3(
            prompt=body.prompt,
            lyrics=body.lyrics,
            description_for_categorization=body.prompt,
            **body.model_dump(exclude={"prompt", "lyrics"}),
        )

    @modal.fastapi_endpoint(method="POST", requires_proxy_auth=True)
    def generate_from_described_lyrics(
        self, request: Request, body: GenerateWithDescribedLyricsRequest
    ):
        require_generation_token(request)
        lyrics = ""
        if not body.instrumental:
            lyrics = self.generate_lyrics(body.described_lyrics)

        return self.generate_and_upload_to_s3(
            prompt=body.prompt,
            lyrics=lyrics,
            description_for_categorization=body.prompt,
            **body.model_dump(exclude={"described_lyrics", "prompt"}),
        )


# ---------- helpers that run on YOUR laptop ----------
def say(message: str):
    print(f">>> {message}", flush=True)

def auth_headers() -> dict:
    """The key and secret that unlock the endpoints (read from environment variables)."""
    key = os.environ.get("MODAL_KEY")
    secret = os.environ.get("MODAL_SECRET")
    if not key or not secret:
        raise SystemExit(
            "MODAL_KEY / MODAL_SECRET are not set in this terminal.\n"
            "Set them first, then run again."
        )
    return {"Modal-Key": key, "Modal-Secret": secret}

def post_with_heartbeat(url: str, label: str, json_body=None):
    """POST request (with the key and secret) that prints 'still waiting' every 30s."""
    import requests

    stop = threading.Event()
    started = time.time()

    def heartbeat():
        while not stop.wait(30):
            say(f"still waiting for {label}... {time.time() - started:.0f}s")

    threading.Thread(target=heartbeat, daemon=True).start()
    try:
        return requests.post(
            url, json=json_body, headers=auth_headers(), timeout=1800
        )
    finally:
        stop.set()


# ---------- one command runs everything ----------
#   python -m modal run main.py
@app.local_entrypoint()
def main():
    auth_headers()  # stops early with a clear message if the key is missing

    # ===== Step 1: simple test song =====
    say("STEP 1: test song (the first run after idle can take several minutes)")
    url = MusicGenServer().generate.get_web_url()
    response = post_with_heartbeat(url, "the song")
    if response.status_code in (401, 403):
        raise SystemExit(
            f"Locked out (status {response.status_code}): the key or secret is wrong "
            "or expired. Create a token on modal.com and set the two values again."
        )
    response.raise_for_status()
    filename = response.json()["filename"]

    try:
        with open("generated.wav", "wb") as f:
            for chunk in output_volume.read_file(filename):
                f.write(chunk)
        say("saved generated.wav")
    except Exception as e:
        say(f"download failed: {e}")
        say("The song is safe in the cloud. Retry with:")
        say(f"python -m modal volume get music-outputs {filename} generated.wav --force")

    # ===== Step 2: full pipeline (lyrics + song + cover + S3) =====
    say("STEP 2: full pipeline with S3")
    try:
        url2 = MusicGenServer().generate_from_description.get_web_url()
        payload = {
            "full_described_song": "Acoustic Ballad",
            "audio_duration": 30,
            "guidance_scale": 7.5,
        }

        response2 = post_with_heartbeat(url2, "the full pipeline", payload)
        if response2.status_code != 200:
            say(f"server said: {response2.text[:500]}")
        response2.raise_for_status()

        result = response2.json()
        say("SUCCESS")
        say(f"song key:   {result['s3_key']}")
        say(f"cover key:  {result['cover_image_s3_key']}")
        say(f"categories: {result['categories']}")
    except Exception as e:
        say(f"Step 2 failed: {e}")

    say("ALL DONE")