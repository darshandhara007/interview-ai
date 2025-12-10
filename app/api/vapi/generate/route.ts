import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getRandomInterviewCover } from "@/lib/utils";
import { db } from "@/firebase/admin";

export async function GET() {
    return Response.json({ success: true, data: "THANK YOU!" }, { status: 200 });
}

export async function POST(request: Request) {
    const body = await request.json();

    let type, role, level, techstack, amount, userid;
    let toolCallId = null;

    // Handle Vapi webhook or direct API call
    if (body.message?.type === "tool-calls") {
        const toolCall = body.message.toolCallList[0];
        toolCallId = toolCall.id;
        const args = toolCall.function.arguments;

        type = args.type;
        role = args.role;
        level = args.level;
        techstack = args.techstack;
        amount = args.amount;
        userid = args.userid;
    } else {
        ({ type, role, level, techstack, amount, userid } = body);
    }

    try {
        const { text: questions } = await generateText({
            model: google("gemini-2.0-flash-001"),
            prompt: `Prepare questions for a job interview.
The job role is ${role}.
The job experience level is ${level}.
The tech stack used in the job is: ${techstack}.
The focus between behavioural and technical questions should lean towards: ${type}.
The amount of questions required is: ${amount}.
Return only the questions in this format:
["Question 1", "Question 2", "Question 3"]
Do not include any special characters that break a voice assistant.`
        });

        const interview = {
            role,
            type,
            level,
            techstack: techstack.split(",").map((t: string) => t.trim()),
            questions: JSON.parse(questions),
            userId: userid,
            finalized: true,
            coverImage: getRandomInterviewCover(),
            createdAt: new Date().toISOString()
        };

        const docRef = await db.collection("interviews").add(interview);

        // Vapi webhook response
        if (toolCallId) {
            return Response.json(
                {
                    results: [
                        {
                            toolCallId,
                            result: JSON.stringify({
                                success: true,
                                message: "Interview successfully generated",
                                interviewId: docRef.id
                            })
                        }
                    ]
                },
                { status: 200 }
            );
        }

        // Direct API response
        return Response.json(
            { success: true, interviewId: docRef.id },
            { status: 200 }
        );

    } catch (error) {
        console.error(error);

        if (toolCallId) {
            return Response.json(
                {
                    results: [
                        {
                            toolCallId,
                            result: JSON.stringify({
                                success: false,
                                error: "Failed to generate interview"
                            })
                        }
                    ]
                },
                { status: 200 } // Vapi requires 200 even on tool errors
            );
        }

        return Response.json({ success: false, error }, { status: 500 });
    }
}
