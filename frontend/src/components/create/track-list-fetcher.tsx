"use server";

import { getUserTracks } from "~/actions/song";
import { TrackList } from "./track-list";

export default async function TrackListFetcher() {
  const tracks = await getUserTracks();
  return <TrackList tracks={tracks} />;
}
