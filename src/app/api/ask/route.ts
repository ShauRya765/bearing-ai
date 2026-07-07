import { NextRequest, NextResponse } from "next/server";
import { askRules } from "@/lib/rag/retrieve";

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json(
        { error: "A question is required." },
        { status: 400 },
      );
    }

    const result = await askRules(question.trim());
    return NextResponse.json(result);
  } catch (err) {
    console.error("Ask route failed:", err);
    return NextResponse.json(
      { error: "Something went wrong answering that." },
      { status: 500 },
    );
  }
}