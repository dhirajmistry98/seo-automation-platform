import { MongoClient } from "mongodb";
import { assertProductionEnvironment } from "@/lib/production-env";

assertProductionEnvironment();

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable in .env");
}

if (uri.includes("YOUR_CLUSTER_HOST")) {
  throw new Error(
    "Invalid MONGODB_URI: 'YOUR_CLUSTER_HOST' detected in .env. Please update with your real cluster host or use local MongoDB: mongodb://127.0.0.1:27017/seo_automation"
  );
}

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

const clientPromise =
  globalForMongo.mongoClientPromise ??
  new MongoClient(uri, {
    // Serverless: many small instances under load. Keep each pool small and close idle
    // connections so a traffic burst stays well under the Atlas connection limit.
    maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE) || 5,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 60_000,
    retryWrites: true,
    retryReads: true,
  }).connect();

// Reuse one client per instance (dev hot reload and warm serverless invocations alike).
globalForMongo.mongoClientPromise = clientPromise;

export default clientPromise;
