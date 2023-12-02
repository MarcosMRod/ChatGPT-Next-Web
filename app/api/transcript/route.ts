import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

export async function POST(req: NextRequest) {
  const data = await req.json();
  const transcriptArray = await YoutubeTranscript.fetchTranscript(data.url);
  const transcripts = transcriptArray.reduce(
    (string, { text }) => string + " " + text,
    "",
  );
  return NextResponse.json(transcripts);
}
