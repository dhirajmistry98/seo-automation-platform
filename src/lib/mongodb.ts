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
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  }).connect();

if (process.env.NODE_ENV !== "production") {
  globalForMongo.mongoClientPromise = clientPromise;
}

export default clientPromise;
