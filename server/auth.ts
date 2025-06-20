import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User, insertUserSchema } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends User {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = randomBytes(32).toString("hex");
    console.warn("Warning: Using a generated SESSION_SECRET. This will change on restart.");
  }

  // For local deployment, we need consistent cookies
  const isProduction = process.env.NODE_ENV === "production";
  console.log(`Auth setup in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} mode`);

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true, // Changed to true to ensure session is always created
    cookie: {
      secure: false, // Set to false for local development to work with http
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      httpOnly: true,
      path: '/'
    },
    store: storage.sessionStore,
  };
  
  // Debug session configuration
  console.log(`Session cookie settings: secure=${sessionSettings.cookie?.secure}, sameSite=${sessionSettings.cookie?.sameSite}`);

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      console.log("Registration attempt:", req.body.username);
      
      const validationResult = insertUserSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation error", 
          details: validationResult.error.errors 
        });
      }

      // Check if username is already taken
      const existingUserByUsername = await storage.getUserByUsername(req.body.username);
      if (existingUserByUsername) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Check if email is already taken
      const existingUserByEmail = await storage.getUserByEmail(req.body.email);
      if (existingUserByEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Create user with hashed password
      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });
      
      console.log("User created successfully:", user.id);

      // Log the user in
      req.login(user, (err) => {
        if (err) {
          console.error("Login error after registration:", err);
          return next(err);
        }
        console.log("User logged in successfully after registration. Session ID:", req.sessionID);
        
        // Explicitly save the session to ensure it's stored
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return next(saveErr);
          }
          res.status(201).json(user);
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log("Login attempt:", req.body.username);
    
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error("Authentication error:", err);
        return next(err);
      }
      
      if (!user) {
        console.log("Authentication failed for user:", req.body.username);
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      console.log("Authentication successful for user:", user.username);
      
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("Login error:", loginErr);
          return next(loginErr);
        }
        
        console.log("User logged in successfully. Session ID:", req.sessionID);
        
        // Explicitly save the session to ensure it's stored
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return next(saveErr);
          }
          
          // Add debug information to verify session is saved correctly
          console.log("Session saved successfully. User authenticated:", req.isAuthenticated());
          
          return res.status(200).json(user);
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    console.log("GET /api/user - Session ID:", req.sessionID);
    console.log("GET /api/user - Is authenticated:", req.isAuthenticated());
    console.log("GET /api/user - Session data:", req.session);
    
    if (!req.isAuthenticated()) {
      console.log("User not authenticated");
      return res.sendStatus(401);
    }
    
    console.log("User authenticated, returning user data");
    res.json(req.user);
  });
}