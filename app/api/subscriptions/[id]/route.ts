import { MongoClient } from "mongodb";
import { Subscription } from "../route";

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!mongoUri || !dbName) {
    throw new Error(
        "Missing MongoDB connection string, database name, or Google OAuth credentials"
    );
}

// POST /api/subscriptions/[id]
// Toggles the 'enabled' field of the subscription with the given channelId from path parameter
export async function POST(request: Request) {
    const client = new MongoClient(mongoUri!);

    try {
        await client.connect();
        const db = client.db(dbName);

        // Get the [id] param from the request URL
        const url = new URL(request.url);
        const id = url.pathname.split("/").pop();

        // Fetch the subscription document
        const sub = await db.collection<Subscription>("subscriptions").findOne({
            channelId: id,
        });

        // Toggle the enabled field
        await db.collection("subscriptions").updateOne(
            {
                channelId: id,
            },
            {
                $set: {
                    enabled: !sub?.enabled,
                },
            }
        );

        return Response.json({
            success: true,
        });
    } catch (error) {
        console.error("Error getting token:", error);
        return Response.json(
            { message: "Authentication failed!" },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}
