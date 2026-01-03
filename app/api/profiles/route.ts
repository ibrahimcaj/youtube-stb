import { MongoClient } from "mongodb";

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!mongoUri || !dbName) {
    throw new Error("Missing MongoDB connection string or database name");
}

export async function GET() {
    const client = new MongoClient(mongoUri!);

    try {
        await client.connect();
        const db = client.db(dbName);
        const docs = await db.collection("profiles").find({}).toArray();

        return Response.json(docs);
    } catch (error) {
        console.error("Database error:", error);
        return Response.json(
            { error: "Failed to fetch docs" },
            { status: 500 }
        );
    } finally {
        await client.close();
    }
}
