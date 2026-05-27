const Redis = require("ioredis");

// Create Redis connection based on environment
function createRedisConnection() {
  // Check if REDIS_URL is provided (common for production services like Heroku, Render, etc.)
  if (process.env.REDIS_URL) {
    console.log("🔗 Connecting to Redis using REDIS_URL...");
    return new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  // Otherwise use individual configuration
  const redisConfig = {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };

  // Add password if provided
  if (process.env.REDIS_PASSWORD) {
    redisConfig.password = process.env.REDIS_PASSWORD;
  }

  console.log(`🔗 Connecting to Redis at ${redisConfig.host}:${redisConfig.port}...`);
  return new Redis(redisConfig);
}

// Create connection instance
const redisConnection = createRedisConnection();

// Handle connection events
redisConnection.on("connect", () => {
  console.log("✅ Redis connected successfully!");
});

redisConnection.on("error", (err) => {
  console.error("❌ Redis connection error:", err.message);
});

redisConnection.on("close", () => {
  console.log("🔌 Redis connection closed");
});

module.exports = {
  redisConnection,
  createRedisConnection,
};