import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getRandomInterviewCover } from "@/lib/utils";
import { db } from "@/firebase/admin";

export async function GET() {
    return Response.json({ success: true, data: 'THANK YOU!' }, { status: 200 });
}

export async function POST(request: Request) {
    const body = await request.json();

    // Parse parameters - handle both Vapi webhook and direct API calls
    let type, role, level, techstack, amount, userid;
    let toolCallId = null;

    if (body.message?.type === 'tool-calls') {
        // Vapi webhook format
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
        // Direct API call format
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
        Please return only the questions, without any additional text.
        The questions are going to be read by a voice assistant so do not use "/" or "*" or any other special characters which might break the voice assistant.
        Return the questions formatted like this:
        ["Question 1", "Question 2", "Question 3"]
        
        Thank you! <3
    `,
        });

        const interview = {
            role,
            type,
            level,
            techstack: techstack.split(',').map((t: string) => t.trim()),
            questions: JSON.parse(questions),
            userId: userid,
            finalized: true,
            coverImage: getRandomInterviewCover(),
            createdAt: new Date().toISOString()
        };

        const docRef = await db.collection("interviews").add(interview);

        // Return response in appropriate format
        if (toolCallId) {
            // Vapi expects this format
            return Response.json({
                results: [
                     toolCallId,
                        result: JSON.stringify({
                            success: true,
                            message: "Interview successfully generated",
                            interviewId: docRef.id
                        })
                    }
                ]
            }, { status: 200 });
        } else {
            // Direct API call response
            return Response.json({ success: true, interviewId: docRef.id }, { status: 200 });
        }

    } catch (error) {
        console.error(error);

        if (toolCallId) {
            // Vapi error format
            return Response.json({
                results: [
                     toolCallId,
                        result: JSON.stringify({
                            success: false,
                            error: "Failed to generate interview"
                        })
                    }
                ]
            }, { status: 200 }); // Note: Vapi expects 200 even for tool errors
        } else {
            return Response.json({ success: false, error }, { status: 500 });
        }
    }
}
