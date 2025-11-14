const slugify = require("slugify");
const User = require("../models/user");
function calculateProfileCompletion(user) {
  const totalFields = 64; // Total possible fields

  let completedFields = 0;

  // Check each field in the user object
  Object.keys(user.toObject()).forEach((key) => {
    const value = user[key];
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      value !== "N/A"
    ) {
      if (Array.isArray(value) && value.length > 0) {
        completedFields++;
      } else if (typeof value === "object" && !Array.isArray(value)) {
        // For nested objects like profilePic, coverPhoto
        if (value.url || Object.keys(value).length > 0) {
          completedFields++;
        }
      } else if (typeof value !== "object") {
        completedFields++;
      }
    }
  });

  const percentage = Math.round((completedFields / totalFields) * 100);
  return {
    completed: completedFields,
    total: totalFields,
    percentage: percentage,
  };
}
function generateProfileSlug(user) {
  // Use name if available, otherwise username
  const baseName = user.username;

  let parts = [baseName];

  // **FIXED**: Prioritize most specific to least specific location
  let locationPart = null;

  if (
    user.birthPlace &&
    user.birthPlace.trim() &&
    user.birthPlace.toLowerCase() !== "n/a"
  ) {
    locationPart = user.birthPlace;
  } else if (
    user.city &&
    user.city.trim() &&
    user.city.toLowerCase() !== "n/a"
  ) {
    locationPart = user.city;
  } else if (
    user.country &&
    user.country.trim() &&
    user.country.toLowerCase() !== "n/a"
  ) {
    locationPart = user.country;
  } else if (
    user.nationality &&
    user.nationality.trim() &&
    user.nationality.toLowerCase() !== "n/a"
  ) {
    locationPart = user.nationality;
  }

  if (locationPart) {
    parts.push(`from-${locationPart}`);
  }

  // Add age if available
  if (user.age) {
    parts.push(`${user.age}`);
  }

  // Join parts and slugify
  const slug = slugify(parts.join(" "), {
    lower: true,
    strict: true, // Remove special characters
    locale: "en",
  });

  return slug;
}
async function generateUniqueSlug(user) {
  let baseSlug = generateProfileSlug(user);
  let slug = baseSlug;
  let counter = 1;

  // Check if slug already exists
  while (await User.findOne({ profileSlug: slug, _id: { $ne: user._id } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}
// ...existing code...

/**
 * Finds profiles similar to the given profile based on age, location, and ethnicity
 * @param {Object} profile - The profile to find similar profiles for
 * @param {Number} limit - Maximum number of similar profiles to return (default: 3)
 * @param {String} userId - Current user ID to exclude from results (optional)
 * @return {Promise<Array>} - Array of similar profiles
 */
async function findSimilarProfiles(profile, limit = 3, userId = null) {
  try {
    // Basic filters
    const baseFilters = {
      _id: { $ne: profile._id }, // Exclude current profile
      gender: profile.gender     // Same gender as current profile
    };

    // Exclude logged-in user if provided
    if (userId) {
      baseFilters._id.$nin = [profile._id, userId];
    }

    // Scoring parameters - used to calculate similarity score
    const ageRange = 5;  // +/- 5 years
    const cityBoost = 4; // City match is worth 4 points
    const ethnicityBoost = 3; // Ethnicity match is worth 3 points
    const ageBoost = 2; // Age within range is worth 2 points

    // Create aggregation pipeline
    const pipeline = [
      // Stage 1: Apply base filters
      { $match: baseFilters },

      // Stage 2: Calculate match score using $addFields
      {
        $addFields: {
          score: {
            $sum: [
              // City/location match (4 points)
              {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$city", profile.city] },
                      { $ne: ["$city", null] },
                      { $ne: ["$city", ""] }
                    ]
                  },
                  cityBoost,
                  0
                ]
              },

              // Ethnicity match (3 points)
              {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$ethnicity", profile.ethnicity] },
                      { $ne: ["$ethnicity", null] },
                      { $ne: ["$ethnicity", ""] }
                    ]
                  },
                  ethnicityBoost,
                  0
                ]
              },

              // Age within range (2 points)
              {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$age", (profile.age || 25) - ageRange] },
                      { $lte: ["$age", (profile.age || 25) + ageRange] },
                      { $ne: ["$age", null] }
                    ]
                  },
                  ageBoost,
                  0
                ]
              }
            ]
          }
        }
      },

      // Stage 3: Sort by score (descending) and then by creation date (newest first)
      { $sort: { score: -1, createdAt: -1 } },

      // Stage 4: Limit to the requested number
      { $limit: limit },

      // Stage 5: Project only needed fields to reduce data size
      {
        $project: {
          _id: 1,
          username: 1,
          name: 1,
          age: 1,
          city: 1,
          country: 1,
          ethnicity: 1,
          profileSlug: 1,
          gender: 1,
          profilePic: 1,
          score: 1
        }
      }
    ];

    // Execute aggregation
    const User = require('../models/user');
    const similarProfiles = await User.aggregate(pipeline);

    // If we don't have enough profiles, try again with less strict criteria
    if (similarProfiles.length < limit) {
      // Simplified query to just get profiles of same gender
      const additionalProfiles = await User.find({
        _id: { $ne: profile._id },
        gender: profile.gender
      })
        .select('_id username name age city country ethnicity profileSlug gender profilePic')
        .sort({ createdAt: -1 })
        .limit(limit - similarProfiles.length);

      // Add these to our results
      similarProfiles.push(...additionalProfiles);
    }

    return similarProfiles;
  } catch (error) {
    console.error('Error finding similar profiles:', error);
    return [];
  }
}

module.exports = {
  // ...existing exports...
  calculateProfileCompletion,
  generateProfileSlug,
  generateUniqueSlug,
  findSimilarProfiles // Add the new function to exports
};

module.exports = {
  calculateProfileCompletion,
  generateProfileSlug,
  generateUniqueSlug,
  findSimilarProfiles
};
