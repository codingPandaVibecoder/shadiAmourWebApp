// Middleware to check if user is admin or moderator
const requireAdminOrModerator = (req, res, next) => {
  if (req.session.isAdmin || req.session.isModerator) {
    return next();
  }
  return res.redirect("/login");
};

// Middleware to check if user is admin only (for edit/delete/add operations)
const requireAdminOnly = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.ADMIN_API_KEY;

 
  console.log("------------------------------------------------");
  if (apiKey && apiKey === process.env.ADMIN_API_KEY) {
    req.isApiRequest = true; // Flag for later use if needed
    return next();
  }
  if (req.session.isAdmin) {
    return next(); 
  }
  return res.status(403).json({
    error: "Forbidden: Admin access required for this operation",
  });
};

// Middleware to check view access (admin, moderator, or own profile)
const requireViewAccess = (req, res, next) => {
  if (req.session.isAdmin || req.session.isModerator) {
    return next();
  }

  // For regular users, they can only access their own data
  const userId = req.params.id || req.body.userId;
  if (req.session.userId && req.session.userId === userId) {
    return next();
  }

  return res.status(403).json({
    error: "Forbidden: Access denied",
  });
};

module.exports = {
  requireAdminOrModerator,
  requireAdminOnly,
  requireViewAccess,
};
