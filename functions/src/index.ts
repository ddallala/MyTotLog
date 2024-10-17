import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { DateTime } from 'luxon';

import OpenAI from "openai";
// import Anthropic from "@anthropic-ai/sdk";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { PromptTemplate, PipelinePromptTemplate } from "@langchain/core/prompts";
import { LangChainTracer } from "langchain/callbacks";
import { Client } from "langsmith";

// Initialize Firebase Admin SDK
admin.initializeApp();

// interface AnthropicResponse {
//     content: Array<{
//         text?: string;
//         type: string;
//         [key: string]: any;
//     }>;
// }
interface ChatMessagesFs {
    role: string;
    content: string;
    createdAt: FieldValue;
}

interface ActivityFs {
    id?: string;
    type: string; // Type of activity
    amount: number; // Amount of feed (if applicable)
    createdate_fstimestamp: Timestamp; // Timestamp of the activity
    note?: string; // Note about the activity
    createdAt?: Timestamp; // Timestamp of the activity
    [key: string]: any; // Index signature to allow additional properties
}
interface Activity {
    id: string;
    type: string; // Type of activity
    amount: number; // Amount of feed (if applicable)
    createdate_localisodatetimestring: string; // Timestamp of the activity
    createdate_humanreadable: string; // Timestamp of the
    note?: string; // Note about the activity
    [key: string]: any; // Index signature to allow additional properties
}

enum AIModels {
    OpenAI_GPT4O_Mini = "gpt-4o-mini",
    Anthropic_Claude_3_5_Sonnet = "claude-3-5-sonnet-20240620",
    Google_Gemini_1_5_PRO = "gemini-1.5-pro",
    Google_Gemini_1_5_FLASH = "gemini-1.5-flash",
}

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

export const helloWorld = onRequest((request, response) => {
    logger.info("Hello logs!", { structuredData: true });
    response.send("Hello from Firebase!");
});


export const callOpenAI = onCall(
    { secrets: ["OPENAI_API_KEY"] },
    async (request) => {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        try {
            const completion = await openai.chat.completions.create({
                model: AIModels.OpenAI_GPT4O_Mini,
                messages: [{ role: "user", content: request.data.prompt }],
            });

            return {
                result: completion.choices[0].message.content,
            };
        } catch (error) {
            console.error("Error calling OpenAI:", error);
            throw new HttpsError("internal", "Failed to call OpenAI API");
        }
    }
);

export const evaluateTranscription = onCall(
    { secrets: ["OPENAI_API_KEY"] },
    async (request) => {
        logger.info("evaluateTranscription call", { structuredData: true });
        logger.info(request.data, { structuredData: true });


        const userTimezone = request.data.userTimezone || "America/New_York";
        const userTime = request.data.userTime || (new Date()).toISOString();
        const transcription = request.data.transcription || "";

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const LLM_system_instructions = "Your singular job is to return the \"add_feeding\" function with the correct parameters extracted from the user prompt. You will also be provided the current time for reference.";
        let LLM_prompt = transcription + "\n";
        LLM_prompt += `[USER TIMEZONE]: ${userTimezone}\n`;
        LLM_prompt += `[USER CURRENT TIME]: ${userTime}\n`;

        const TOOLS: [any] = [{
            type: "function",
            function: {
                name: "add_feeding",
                description: "Function to add a new feeding activity containing both the amount eaten in ML and the datetime",
                parameters: {
                    type: "object",
                    properties: {
                        amount: {
                            type: "number",
                            description: "The feeding amount in ML. Return -1 if you are unable to extract an amount",
                        },
                        time: {
                            type: "string",
                            description: "The time in the following format: YYYY-MM-DD HH:MM:SS. Return -1 if you are unable to extract a time",
                        },
                    },
                    additionalProperties: false,
                    required: [
                        "amount",
                        "time",
                    ],
                },
                strict: true,
            },
        }];

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: LLM_system_instructions }, { role: "user", content: LLM_prompt }],
            tools: TOOLS,
            parallel_tool_calls: true,
            temperature: 1,
            max_tokens: 2048,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
            response_format: {
                "type": "text",
            },
        });

        logger.info("Evaluate call response", { structuredData: true });
        logger.info(response, { structuredData: true });
        logger.info(response.choices[0].message, { structuredData: true });
        const toolCall = response.choices[0].message.tool_calls?.[0];
        if (!toolCall) {
            throw new HttpsError("internal", "Tool call is undefined");
        }
        const args = JSON.parse(toolCall.function.arguments);

        return { ai_evaluated_args: args };
    }
);

export const transcribeAudio = onCall(
    { secrets: ["OPENAI_API_KEY"] },
    async (request) => {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        try {
            // The audio data will be sent as a base64 encoded string
            const audioData = Buffer.from(request.data.audioBase64, "base64");

            // Create a temporary file
            const tempFilePath = path.join(os.tmpdir(), "audio.wav");
            fs.writeFileSync(tempFilePath, audioData);

            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: "whisper-1",
            });

            // Clean up the temporary file
            fs.unlinkSync(tempFilePath);

            return {
                transcription: transcription.text,
            };
        } catch (error) {
            console.error("Error transcribing audio:", error);
            throw new HttpsError("internal", "Failed to transcribe audio");
        }
    }
);


export const fetchInsights = onCall(
    { secrets: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "LANGCHAIN_TRACING_V2", "LANGCHAIN_ENDPOINT", "LANGCHAIN_API_KEY", "LANGCHAIN_PROJECT"] },
    async (request) => {
        // getting variables from request.data
        // logger.info("fetchInsights call", { structuredData: true });
        // logger.info(request.data, { structuredData: true });
        const db = getFirestore();
        const { sessionId } = request.data;

        // Initialize LangSmith Tracer with the client
        const client = new Client({ apiKey: process.env.LANGCHAIN_API_KEY, apiUrl: process.env.LANGCHAIN_ENDPOINT });
        const tracer = new LangChainTracer({
            client,
            projectName: process.env.LANGCHAIN_PROJECT, // Replace with your desired project name
        });


        let useModelFrom = request.data.useModelFrom || "openai";

        const LLM_system_instructions = await createFormattedSystemPrompt(request);

        // get user prompt override from session
        const sessionRef = db.collection("sessions").doc(sessionId);
        const sessionDoc = await sessionRef.get();
        const userPromptOverride = sessionDoc.get("user_prompt_override") || "";
        const userPromptDefaultString = `
Look at the # feedings section for data about all the previous feedings, usually feedings are every 3 to 4 hrs. When should the next feeding be?
  
Look at the # aggregate baby feeding data section for the "last 24hrs totals", newborns should in general feed about {amount_required_per_day} mL per 24 hrs. 
  
Make it helpful, short and concise.
`;

        // Create a PromptTemplate for the user prompt
        const userPromptTemplate = new PromptTemplate({
            inputVariables: ["amount_required_per_day"],
            template: userPromptOverride || userPromptDefaultString,
        });
        // Format the prompt with the specific amount
        const LLM_prompt = await userPromptTemplate.format({ amount_required_per_day: request.data.amount_required_per_day });

        // Create messages array with SystemMessage and HumanMessage
        const messages = [
            new SystemMessage(LLM_system_instructions),
            new HumanMessage(LLM_prompt),
        ];

        // create insights variable
        let insights = "";

        switch (useModelFrom) {
            case "anthropic": {
                // CALL TO ANTHROPIC
                const anthropicchat = new ChatAnthropic({
                    apiKey: process.env.ANTHROPIC_API_KEY,
                    model: AIModels.Anthropic_Claude_3_5_Sonnet,
                    temperature: 0,
                    maxTokens: undefined,
                });

                const anthropicresponse = await anthropicchat.invoke(messages, { callbacks: [tracer] });
                insights = Array.isArray(anthropicresponse.content) ? anthropicresponse.content.join(' ') : anthropicresponse.content;
                break;
            }
            case "google": {
                // CALL TO Google
                const googlechat = new ChatGoogleGenerativeAI({
                    apiKey: process.env.GOOGLE_API_KEY,
                    model: AIModels.Google_Gemini_1_5_FLASH,
                    temperature: 0,
                    maxRetries: 2,
                    // other params...
                });

                const googleresponse = await googlechat.invoke(messages, { callbacks: [tracer] });
                insights = Array.isArray(googleresponse.content) ? googleresponse.content.join(' ') : googleresponse.content;
                break;
            }
            default: {
                // CALL TO OPENAI
                // Use ChatOpenAI from LangChain
                const openaichat = new ChatOpenAI({
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    modelName: AIModels.OpenAI_GPT4O_Mini,
                    temperature: 0,
                });

                const openairesponse = await openaichat.invoke(messages, { callbacks: [tracer] });
                insights = Array.isArray(openairesponse.content) ? openairesponse.content.join(' ') : openairesponse.content;
                break;
            }
        }

        return {
            insights: insights,
            LLM_system_instructions: LLM_system_instructions,
            LLM_prompt: LLM_prompt,
        };
    }
);

export const createChat = onCall(async (request) => {
    const { sessionId } = request.data;

    if (!sessionId) {
        throw new HttpsError("invalid-argument", "Session ID is required");
    }

    try {
        const db = getFirestore();

        // creating the chat
        const chatsRef = db.collection("sessions").doc(sessionId).collection("chats");
        const newChatRef = await chatsRef.add({
            createdAt: FieldValue.serverTimestamp(),
        });

        // Create the first system message
        const formattedPromptForSystem = await createFormattedSystemPrompt(request);

        // Add the first system message to the chat
        const messagesRef = chatsRef.doc(newChatRef.id).collection("messages");
        const newMessageRef = await messagesRef.add(<ChatMessagesFs>{
            role: "system",
            content: formattedPromptForSystem,
            createdAt: FieldValue.serverTimestamp(),
        });

        // adding a hello message (needed to start with a user message for anthropic)
        await messagesRef.add(<ChatMessagesFs>{
            role: "user",
            content: "Hi",
            createdAt: FieldValue.serverTimestamp(),
        });

        // adding a hello message
        await messagesRef.add(<ChatMessagesFs>{
            role: "assistant",
            content: "Hi there! How can I help you today?",
            createdAt: FieldValue.serverTimestamp(),
        });

        // Return the chat ID and the message ID
        return {
            chatId: newChatRef.id,
            messageRefId: newMessageRef.id,
        };
    } catch (error) {
        console.error("Error creating chat:", error);
        throw new HttpsError("internal", "Failed to create chat");
    }
});

export const sendMessageToAi = onCall(
    { secrets: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "LANGCHAIN_TRACING_V2", "LANGCHAIN_ENDPOINT", "LANGCHAIN_API_KEY", "LANGCHAIN_PROJECT"] },
    async (request) => {
        const { sessionId, chatId, message } = request.data;
        let useModelFrom = request.data.useModelFrom || "openai";
        console.log(request.data);

        if (!sessionId || !chatId || !message) {
            throw new HttpsError("invalid-argument", "Missing required parameters");
        }

        const db = getFirestore();
        const chatRef = db.collection("sessions").doc(sessionId).collection("chats").doc(chatId);
        const messagesRef = chatRef.collection("messages");

        try {
            // Initialize LangSmith Tracer with the client
            const client = new Client({ apiKey: process.env.LANGCHAIN_API_KEY, apiUrl: process.env.LANGCHAIN_ENDPOINT });
            const tracer = new LangChainTracer({
                client,
                projectName: process.env.LANGCHAIN_PROJECT, // Replace with your desired project name
            });

            // Initialize ChatOpenAI with the tracer callback
            let chat;

            switch (useModelFrom) {
                case "anthropic": {
                    chat = new ChatAnthropic({
                        apiKey: process.env.ANTHROPIC_API_KEY,
                        model: AIModels.Anthropic_Claude_3_5_Sonnet,
                        temperature: 1,
                        maxTokens: undefined,
                    });
                    break;
                }
                case "google": {
                    chat = new ChatGoogleGenerativeAI({
                        apiKey: process.env.GOOGLE_API_KEY,
                        model: AIModels.Google_Gemini_1_5_FLASH,
                        temperature: 1,
                        maxRetries: 2,
                    });
                    break;
                }
                default: {
                    chat = new ChatOpenAI({
                        openAIApiKey: process.env.OPENAI_API_KEY,
                        model: AIModels.OpenAI_GPT4O_Mini,
                        temperature: 1,
                    });
                    break;
                }
            }

            // Retrieve chat history
            const chatDoc = await chatRef.get();
            if (!chatDoc.exists) {
                throw new HttpsError("not-found", "Chat not found");
            }

            // get messages from messages collection
            const messagesSnapshot = await messagesRef.orderBy("createdAt").get();
            const messages = messagesSnapshot.docs.map((doc) => doc.data() as ChatMessagesFs);

            // Now add the new message to Firestore for posterity
            const messagesCollectionRef = chatRef.collection("messages");
            await messagesCollectionRef.add({ role: "user", content: message, createdAt: Timestamp.now() });

            // Convert Firestore messages to LangChain message objects
            const langChainMessages: BaseMessage[] = messages.reduce((acc: BaseMessage[], msg) => {
                switch (msg.role) {
                    case "system":
                        acc.push(new SystemMessage(msg.content));
                        break;
                    case "user":
                        acc.push(new HumanMessage(msg.content));
                        break;
                    case "assistant":
                        acc.push(new AIMessage(msg.content));
                        break;
                }
                return acc;
            }, []);

            // Add the new user message
            langChainMessages.push(new HumanMessage(message));

            // Get AI response from openAI
            const aiResponse = await chat.invoke(langChainMessages, { callbacks: [tracer] });

            // add response to firestore
            await messagesCollectionRef.add({ role: "assistant", content: aiResponse.content, createdAt: Timestamp.now() });

            // return
            return {
                success: true,
                aiResponse: aiResponse.content,
            };
        } catch (error) {
            console.error("Error in sendMessageToAi function:", error);
            throw new HttpsError("internal", "Failed to process message", error);
        }
    }
);


// ======================================== HELPER FUNCTIONS ========================================

// write JSDoc comments for the following functions
/**
 * Convert a Firestore Timestamp to a local ISO datetime string
 * @param timestamp Firestore Timestamp
 * @returns Local ISO datetime string
 */
function toSpecificISODatetimeString(date: Date, timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
    const options = {
        timeZone,
        year: 'numeric' as const,
        month: '2-digit' as const,
        day: '2-digit' as const,
        hour: '2-digit' as const,
        minute: '2-digit' as const,
        second: '2-digit' as const,
        fractionalSecondDigits: 3 as const,
        hourCycle: 'h23' as const,
    };

    const formatter = new Intl.DateTimeFormat('en-GB', options);
    const parts = formatter.formatToParts(date);

    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hours = getPart('hour');
    const minutes = getPart('minute');
    const seconds = getPart('second');
    const milliseconds = getPart('fractionalSecond');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
}

// write JSDoc comments for the following functions
/**
 * Convert a Firestore Timestamp to a human-readable date string
 * @param isodate Firestore Timestamp
 * @returns Human-readable date string
 */
function humanReadableDate(isodate: string) {
    return new Date(isodate).toLocaleString();
}


// JSDoc
/**
 * Create a formatted system prompt
 * @param request Request object
 * @returns Formatted system prompt
 */
async function createFormattedSystemPrompt(request: any): Promise<string> {
    const db = getFirestore();

    const { sessionId } = request.data;
    // get user info from request
    const userTimezone = request.data.userTimezone || "America/New_York";
    const userTime = humanReadableDate(request.data.userTime || (new Date()).toISOString());

    // get baby info from session doc
    const sessionRef = db.collection("sessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();
    const babyname = sessionDoc.get("babyname") || "Baby";
    const babyweight_kg = sessionDoc.get("babyweight_kg") || -1;
    const babybirthdate = DateTime.fromJSDate((sessionDoc.get("babybirthdate") as Timestamp).toDate()).toFormat("MMMM d yyyy") || "unknown";
    const amount_required_per_day = (babyweight_kg != -1 ? 150 * babyweight_kg : -1);
    const additionalSystemInstructions = sessionDoc.get("additional_system_instructions") || "none";

    // get activities from session doc
    const activitiesRef = sessionRef.collection("activities");
    const activitiesSnapshot = await activitiesRef.orderBy("createdate_fstimestamp", "desc").limit(2000).get();
    const activities: Activity[] = activitiesSnapshot.docs.map((doc) => {
        const activityFs = doc.data() as ActivityFs;
        const activity: Activity = <Activity>{
            id: doc.id,
            type: activityFs.type,
            amount: activityFs.amount,
            createdate_localisodatetimestring: toSpecificISODatetimeString(activityFs.createdate_fstimestamp.toDate(), userTimezone),
            createdate_humanreadable: humanReadableDate(toSpecificISODatetimeString(activityFs.createdate_fstimestamp.toDate(), userTimezone)),
            note: activityFs.note,
        };
        return activity;
    });

    // calculate aggregate baby feeding data
    const { totalFeeds_24hrs, numberOfFeeds_24hrs, avgAmountPerFeed_24hrs, totalFeeds_today, numberOfFeeds_today, avgAmountPerFeed_today } = calculateTotalFeeds(userTimezone, userTime, activities);

    // variables for the system prompt
    const LLMSystemPromptTemplate = PromptTemplate.fromTemplate(`# general instructions
You are a newborn assistant.\n
Given the last feeding times and amounts you can provide your advice about when the next feeding should be and other useful insights for new parents.\n
  
# main instructions
- Speak in friendly and concise terms.
- When talking of time, use 8PM instead of 20:00.
- You can find all user data under the # user data section.
- You can find all baby data under the # baby data section.
- You can find all aggregate baby feeding data under the # aggregate baby feeding data section.
- You can find all activity data under the # feedings section.
- You can find additional instructions under the # additional instructions section.
- Leverage all the information you have to make the response friendly and informative for the user (who is a new parent).
- Look for patterns in the feeding data to provide insights, for example, if an activity entry was missing or if the feeding times were irregular.
- Bold the insights you think are important and return the result in MARKDOWN format.

# additional instructions
{additionalSystemInstructions}\n
  
# user data
[USER TIMEZONE]: {userTimezone}\n
[USER CURRENT TIME]: {userTime}\n
  
# baby data
[BABY NAME]: {babyname}\n
[BABY DATE]: {babybirthdate}\n
[BABY WEIGHT]: {babyweight_kg} kg\n
[AMOUNT REQUIRED PER DAY]: {amount_required_per_day} mL\n

# aggregate baby feeding data
[LAST 24HRS NUMBER OF FEEDS]: {numberOfFeeds_24hrs}\n
[LAST 24HRS NUMBER TOTAL FEEDS]: {totalFeeds_24hrs} mL\n
[LAST 24HRS NUMBER AVERAGE AMOUNT PER FEED]: {avgAmountPerFeed_24hrs} mL/day\n
[TODAY NUMBER OF FEEDS]: {numberOfFeeds_today}\n
[TODAY NUMBER TOTAL FEEDS]: {totalFeeds_today} mL\n
[TODAY NUMBER AVERAGE AMOUNT PER FEED]: {avgAmountPerFeed_today} mL/day\n
  
# feedings
| [FEEDING TIME] | [FEEDING AMOUNT] | [FEEDING NOTE] ||---------|---------|---------||
{previous_feedings}
`);
    const activityPrompt = PromptTemplate.fromTemplate(`| {createdate_humanreadable} | {amount} mL | {note} ||`);

    const composedPrompt = new PipelinePromptTemplate({
        pipelinePrompts: [
            { name: "activity", prompt: activityPrompt },
        ],
        finalPrompt: LLMSystemPromptTemplate,
    });

    const formattedActivities = (await Promise.all(
        activities.map(async (activity) => {
            const formattedActivity = await activityPrompt.format({
                ...activity,
                note: activity.note || "",
            });
            return formattedActivity;
        })
    )).join("\n");

    const formattedPrompt = await composedPrompt.format({
        userTimezone,
        userTime,
        babyname,
        babybirthdate,
        babyweight_kg,
        amount_required_per_day,
        numberOfFeeds_24hrs,
        totalFeeds_24hrs,
        avgAmountPerFeed_24hrs,
        totalFeeds_today,
        numberOfFeeds_today,
        avgAmountPerFeed_today,
        previous_feedings: formattedActivities,
        additionalSystemInstructions,
    });

    return formattedPrompt;
}

// JSDoc for the following function
/**
 * Calculate total feeds, number of feeds, and average amount per feed in the last 24 hours
 * @param userTimezone User's timezone
 * @param userTime User's current time
 * @param activities List of activities
 * @returns Object containing total feeds, number of feeds, and average amount per feed in the last 24 hours
 */
function calculateTotalFeeds(userTimezone: string, userTime: string, activities: Activity[]): { totalFeeds_24hrs: number, numberOfFeeds_24hrs: number, avgAmountPerFeed_24hrs: number, totalFeeds_today: number, numberOfFeeds_today: number, avgAmountPerFeed_today: number } {
    // Get the current time in the user's time zone
    const now = DateTime.now().setZone(userTimezone);

    const feeds_24hrs = activities
        .filter(a => a.type === 'feed')
        .filter(a => {
            // Parse activity time in the user's time zone
            const activityTime = DateTime.fromISO(a.createdate_localisodatetimestring, { zone: userTimezone });
            const diffHours = Math.abs(now.diff(activityTime, 'hours').hours);
            return diffHours <= 24; // Feeds in the last 24 hours
        });

    const feeds_today = activities
        .filter(a => a.type === 'feed')
        .filter(a => {
            const activityTime = DateTime.fromISO(a.createdate_localisodatetimestring, { zone: userTimezone });
            return activityTime.hasSame(now, 'day'); // Feeds from today
        });

    // Calculate total amount of feeds in the last 24 hours
    const totalFeeds_24hrs = feeds_24hrs.reduce((sum, a) => sum + parseFloat(a.amount + ""), 0);
    const numberOfFeeds_24hrs = feeds_24hrs.length;
    const avgAmountPerFeed_24hrs = numberOfFeeds_24hrs > 0 ? totalFeeds_24hrs / numberOfFeeds_24hrs : 0;

    // Calculate total amount of feeds today
    const totalFeeds_today = feeds_today.reduce((sum, a) => sum + parseFloat(a.amount + ""), 0);
    const numberOfFeeds_today = feeds_today.length;
    const avgAmountPerFeed_today = numberOfFeeds_today > 0 ? totalFeeds_today / numberOfFeeds_today : 0;

    return {
        totalFeeds_24hrs,
        numberOfFeeds_24hrs,
        avgAmountPerFeed_24hrs,
        totalFeeds_today,
        numberOfFeeds_today,
        avgAmountPerFeed_today,
    };
}
