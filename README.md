# 🎵 Suno AI Clone

A full-stack AI music generation app inspired by [Suno AI](https://suno.com). Describe a song in plain English and get back a fully produced audio track — complete with AI-generated lyrics, cover art, and genre tags.

---

## ✨ Features

- 🎼 **AI Music Generation** — Powered by [ACE-Step](https://github.com/ace-step/ACE-Step), a state-of-the-art open-source music generation model
- ✍️ **Lyrics Writing** — Uses Qwen2-7B-Instruct LLM to auto-generate song lyrics from your description
- 🖼️ **Cover Art** — SDXL-Turbo generates a matching album cover for every song
- 🏷️ **Auto-Categorization** — Automatically tags songs with genre/mood categories
- ☁️ **Cloud-Native Backend** — Runs on [Modal](https://modal.com) serverless GPU infrastructure (L40S)
- 🔐 **Authentication** — Built-in auth with [better-auth](https://www.better-auth.com/)
- 🗄️ **Database** — Prisma ORM with schema-driven migrations

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React 19, Tailwind CSS v4 |
| **Auth** | better-auth |
| **Database** | Prisma ORM |
| **Backend** | Python, Modal (serverless GPU) |
| **Music Model** | ACE-Step |
| **LLM** | Qwen2-7B-Instruct |
| **Image Model** | SDXL-Turbo (stabilityai) |
| **Storage** | AWS S3 |

---

## 📁 Project Structure

```
suno-ai-clone/
├── backend/
│   ├── main.py          # Modal app — GPU server & API endpoints
│   ├── prompts.py       # LLM prompt templates
│   ├── requirements.txt # Python dependencies
│   └── ACE-Step/        # Music generation model (submodule)
│
└── frontend/
    ├── src/
    │   ├── app/         # Next.js App Router pages & API routes
    │   ├── lib/         # Auth configuration
    │   ├── server/      # Server-side utilities (DB client)
    │   └── styles/      # Global CSS
    ├── prisma/
    │   └── schema.prisma
    └── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **Python** ≥ 3.12
- A [Modal](https://modal.com) account (free tier available)
- An AWS account with an S3 bucket

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/suno-ai-clone.git
cd suno-ai-clone
```

### 2. Backend setup

```bash
cd backend

# Install Modal CLI
pip install modal

# Authenticate with Modal
modal setup

# Create the Modal secret with your AWS credentials
modal secret create music-gen-secret \
  AWS_ACCESS_KEY_ID=your_key \
  AWS_SECRET_ACCESS_KEY=your_secret \
  AWS_REGION=us-east-1 \
  S3_BUCKET_NAME=your_bucket
```

> **Note:** The first run will download model weights to Modal volumes (~10 GB). This can take several minutes.

```bash
# Deploy / run the backend
python -m modal run main.py
```

### 3. Frontend setup

```bash
cd frontend

# Install dependencies
npm install

# Copy the example env file and fill in your values
cp .env.example .env

# Push the database schema
npm run db:push

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚙️ Environment Variables

Create a `.env` file inside `frontend/` (see `.env.example`):

```env
# Database connection string
DATABASE_URL="postgresql://user:password@localhost:5432/suno_clone"

# better-auth secret
BETTER_AUTH_SECRET="your-secret-here"
BETTER_AUTH_URL="http://localhost:3000"

# Your Modal backend endpoint (from `modal deploy`)
NEXT_PUBLIC_BACKEND_URL="https://your-modal-endpoint.modal.run"

# Modal proxy credentials
MODAL_KEY="your-modal-key"
MODAL_SECRET="your-modal-secret"
```

---

## 🎬 Usage

1. Sign up / log in on the frontend
2. Enter a song description (e.g. *"An upbeat indie pop song about summer road trips"*)
3. Choose options: duration, instrumental mode, guidance scale
4. Hit **Generate** and wait for your track!
5. The finished song + cover art is stored in S3 and displayed in the UI

---

## 🛠️ Available Scripts

### Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Turbopack |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:studio` | Open Prisma Studio |
| `npm run lint` | Run ESLint |

### Backend

| Command | Description |
|---------|-------------|
| `python -m modal run main.py` | Run the full pipeline locally via Modal |
| `modal deploy main.py` | Deploy backend to Modal |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

This project is for educational purposes. Music generation is powered by [ACE-Step](https://github.com/ace-step/ACE-Step) — please review their license before commercial use.

---

## 🙏 Acknowledgements

- [ACE-Step](https://github.com/ace-step/ACE-Step) — Open-source music generation model
- [Modal](https://modal.com) — Serverless GPU compute
- [Suno AI](https://suno.com) — Inspiration for this project
- [create-t3-app](https://create.t3.gg/) — Next.js project scaffolding

