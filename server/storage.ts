import { 
  users, User, InsertUser, 
  workerProfiles, WorkerProfile, InsertWorkerProfile,
  employerProfiles, EmployerProfile, InsertEmployerProfile,
  jobs, Job, InsertJob, JobStatus,
  applications, Application, InsertApplication, ApplicationStatus,
  ratings, Rating, InsertRating,
  messages, Message, InsertMessage,
  notifications, Notification, InsertNotification,
  UserType
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

// Storage interface with all required CRUD operations
export interface IStorage {
  // Session store
  sessionStore: any; // Using "any" temporarily to fix type errors
  
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<User>): Promise<User | undefined>;
  updateUserRating(userId: number): Promise<User | undefined>;
  getWorkers(): Promise<User[]>;
  getEmployers(): Promise<User[]>;
  
  // Profile operations
  createWorkerProfile(profile: InsertWorkerProfile): Promise<WorkerProfile>;
  getWorkerProfile(userId: number): Promise<WorkerProfile | undefined>;
  updateWorkerProfile(userId: number, profile: Partial<WorkerProfile>): Promise<WorkerProfile | undefined>;
  getWorkerWithProfile(userId: number): Promise<(User & {profile: WorkerProfile | null}) | undefined>;
  
  createEmployerProfile(profile: InsertEmployerProfile): Promise<EmployerProfile>;
  getEmployerProfile(userId: number): Promise<EmployerProfile | undefined>;
  updateEmployerProfile(userId: number, profile: Partial<EmployerProfile>): Promise<EmployerProfile | undefined>;
  getEmployerWithProfile(userId: number): Promise<(User & {profile: EmployerProfile | null}) | undefined>;
  
  // Job operations
  createJob(job: InsertJob): Promise<Job>;
  getJob(id: number): Promise<Job | undefined>;
  getAllJobs(): Promise<Job[]>;
  getEmployerJobs(employerId: number): Promise<Job[]>;
  updateJob(id: number, job: Partial<Job>): Promise<Job | undefined>;
  deleteJob(id: number): Promise<void>;
  getMatchedJobsForWorker(workerId: number): Promise<Job[]>;
  
  // Application operations
  createApplication(application: InsertApplication): Promise<Application>;
  getApplication(id: number): Promise<Application | undefined>;
  getApplicationByJobAndWorker(jobId: number, workerId: number): Promise<Application | undefined>;
  getWorkerApplications(workerId: number): Promise<Application[]>;
  getEmployerApplications(employerId: number): Promise<Application[]>;
  getJobApplications(jobId: number): Promise<Application[]>;
  updateApplication(id: number, application: Partial<Application>): Promise<Application | undefined>;
  
  // Rating operations
  createRating(rating: InsertRating): Promise<Rating>;
  getUserRatings(userId: number): Promise<Rating[]>;
  
  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getUserMessages(userId: number): Promise<Message[]>;
  getConversation(user1Id: number, user2Id: number): Promise<Message[]>;
  markMessageAsRead(id: number): Promise<Message | undefined>;
  
  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: number): Promise<Notification[]>;
  markNotificationAsRead(id: number): Promise<Notification | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private workerProfiles: Map<number, WorkerProfile>;
  private employerProfiles: Map<number, EmployerProfile>;
  private jobs: Map<number, Job>;
  private applications: Map<number, Application>;
  private ratings: Map<number, Rating>;
  private messages: Map<number, Message>;
  private notifications: Map<number, Notification>;
  
  sessionStore: session.SessionStore;
  private userIdCounter: number;
  private workerProfileIdCounter: number;
  private employerProfileIdCounter: number;
  private jobIdCounter: number;
  private applicationIdCounter: number;
  private ratingIdCounter: number;
  private messageIdCounter: number;
  private notificationIdCounter: number;

  constructor() {
    this.users = new Map();
    this.workerProfiles = new Map();
    this.employerProfiles = new Map();
    this.jobs = new Map();
    this.applications = new Map();
    this.ratings = new Map();
    this.messages = new Map();
    this.notifications = new Map();
    
    this.userIdCounter = 1;
    this.workerProfileIdCounter = 1;
    this.employerProfileIdCounter = 1;
    this.jobIdCounter = 1;
    this.applicationIdCounter = 1;
    this.ratingIdCounter = 1;
    this.messageIdCounter = 1;
    this.notificationIdCounter = 1;
    
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // 24 hours
    });
    
    // Add some demo data
    this.seedData();
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id, 
      rating: 0,
      isVerified: false,
      createdAt: now,
      profilePicture: null
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...userData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async updateUserRating(userId: number): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    const userRatings = await this.getUserRatings(userId);
    if (userRatings.length === 0) return user;
    
    const totalRating = userRatings.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = totalRating / userRatings.length;
    
    const updatedUser = { ...user, rating: parseFloat(averageRating.toFixed(1)) };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async getWorkers(): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.userType === UserType.WORKER);
  }

  async getEmployers(): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.userType === UserType.EMPLOYER);
  }

  // Worker profile operations
  async createWorkerProfile(profile: InsertWorkerProfile): Promise<WorkerProfile> {
    const id = this.workerProfileIdCounter++;
    const workerProfile: WorkerProfile = { ...profile, id, documents: null };
    this.workerProfiles.set(id, workerProfile);
    return workerProfile;
  }

  async getWorkerProfile(userId: number): Promise<WorkerProfile | undefined> {
    return Array.from(this.workerProfiles.values()).find(
      (profile) => profile.userId === userId,
    );
  }

  async updateWorkerProfile(userId: number, profileData: Partial<WorkerProfile>): Promise<WorkerProfile | undefined> {
    const profile = await this.getWorkerProfile(userId);
    if (!profile) return undefined;
    
    const updatedProfile = { ...profile, ...profileData };
    this.workerProfiles.set(profile.id, updatedProfile);
    return updatedProfile;
  }

  async getWorkerWithProfile(userId: number): Promise<(User & {profile: WorkerProfile | null}) | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;
    if (user.userType !== UserType.WORKER) return undefined;
    
    const profile = await this.getWorkerProfile(userId);
    return { ...user, profile: profile || null };
  }

  // Employer profile operations
  async createEmployerProfile(profile: InsertEmployerProfile): Promise<EmployerProfile> {
    const id = this.employerProfileIdCounter++;
    const employerProfile: EmployerProfile = { ...profile, id, documents: null };
    this.employerProfiles.set(id, employerProfile);
    return employerProfile;
  }

  async getEmployerProfile(userId: number): Promise<EmployerProfile | undefined> {
    return Array.from(this.employerProfiles.values()).find(
      (profile) => profile.userId === userId,
    );
  }

  async updateEmployerProfile(userId: number, profileData: Partial<EmployerProfile>): Promise<EmployerProfile | undefined> {
    const profile = await this.getEmployerProfile(userId);
    if (!profile) return undefined;
    
    const updatedProfile = { ...profile, ...profileData };
    this.employerProfiles.set(profile.id, updatedProfile);
    return updatedProfile;
  }

  async getEmployerWithProfile(userId: number): Promise<(User & {profile: EmployerProfile | null}) | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;
    if (user.userType !== UserType.EMPLOYER) return undefined;
    
    const profile = await this.getEmployerProfile(userId);
    return { ...user, profile: profile || null };
  }

  // Job operations
  async createJob(job: InsertJob): Promise<Job> {
    try {
      // Ensure the employer exists
      const employer = await this.getUser(job.employerId);
      if (!employer) {
        throw new Error(`Employer with ID ${job.employerId} does not exist`);
      }
      
      // Ensure status is a valid JobStatusValue if provided
      if (job.status && !Object.values(JobStatus).includes(job.status as JobStatusValues)) {
        job.status = JobStatus.OPEN; // Default to OPEN if invalid
      }
      
      const id = this.jobIdCounter++;
      const now = new Date();
      const newJob: Job = { 
        ...job, 
        id, 
        createdAt: now,
        status: job.status || JobStatus.OPEN,
        skills: job.skills || [],
        hourlyRate: job.hourlyRate || null,
        startDate: job.startDate || null,
        endDate: job.endDate || null
      };
      this.jobs.set(id, newJob);
      console.log("Job created successfully:", newJob);
      return newJob;
    } catch (error) {
      console.error("Error creating job:", error);
      throw error;
    }
  }

  async getJob(id: number): Promise<Job | undefined> {
    return this.jobs.get(id);
  }

  async getAllJobs(): Promise<Job[]> {
    return Array.from(this.jobs.values());
  }

  async getEmployerJobs(employerId: number): Promise<Job[]> {
    return Array.from(this.jobs.values()).filter(
      (job) => job.employerId === employerId,
    );
  }

  async updateJob(id: number, jobData: Partial<Job>): Promise<Job | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    
    const updatedJob = { ...job, ...jobData };
    this.jobs.set(id, updatedJob);
    return updatedJob;
  }

  async deleteJob(id: number): Promise<void> {
    this.jobs.delete(id);
    
    // Also delete all applications for this job
    const jobApplications = await this.getJobApplications(id);
    for (const application of jobApplications) {
      this.applications.delete(application.id);
    }
  }

  async getMatchedJobsForWorker(workerId: number): Promise<Job[]> {
    const worker = await this.getWorkerWithProfile(workerId);
    if (!worker || !worker.profile) return [];
    
    const allJobs = await this.getAllJobs();
    
    // Basic matching based on skills
    return allJobs.filter(job => {
      if (!job.skills || !worker.profile?.skills) return false;
      
      // Check if worker has any of the required skills
      return job.skills.some(skill => 
        worker.profile?.skills.includes(skill)
      );
    });
  }

  // Application operations
  async createApplication(application: InsertApplication): Promise<Application> {
    const id = this.applicationIdCounter++;
    const now = new Date();
    const newApplication: Application = { 
      ...application, 
      id, 
      appliedAt: now,
      updatedAt: now
    };
    this.applications.set(id, newApplication);
    return newApplication;
  }

  async getApplication(id: number): Promise<Application | undefined> {
    return this.applications.get(id);
  }

  async getApplicationByJobAndWorker(jobId: number, workerId: number): Promise<Application | undefined> {
    return Array.from(this.applications.values()).find(
      (app) => app.jobId === jobId && app.workerId === workerId,
    );
  }

  async getWorkerApplications(workerId: number): Promise<Application[]> {
    return Array.from(this.applications.values()).filter(
      (app) => app.workerId === workerId,
    );
  }

  async getEmployerApplications(employerId: number): Promise<Application[]> {
    const employerJobs = await this.getEmployerJobs(employerId);
    const jobIds = employerJobs.map(job => job.id);
    
    return Array.from(this.applications.values()).filter(
      (app) => jobIds.includes(app.jobId),
    );
  }

  async getJobApplications(jobId: number): Promise<Application[]> {
    return Array.from(this.applications.values()).filter(
      (app) => app.jobId === jobId,
    );
  }

  async updateApplication(id: number, applicationData: Partial<Application>): Promise<Application | undefined> {
    const application = this.applications.get(id);
    if (!application) return undefined;
    
    const now = new Date();
    const updatedApplication = { 
      ...application, 
      ...applicationData,
      updatedAt: now
    };
    this.applications.set(id, updatedApplication);
    return updatedApplication;
  }

  // Rating operations
  async createRating(rating: InsertRating): Promise<Rating> {
    const id = this.ratingIdCounter++;
    const now = new Date();
    const newRating: Rating = { ...rating, id, createdAt: now };
    this.ratings.set(id, newRating);
    return newRating;
  }

  async getUserRatings(userId: number): Promise<Rating[]> {
    return Array.from(this.ratings.values()).filter(
      (rating) => rating.toUserId === userId,
    );
  }

  // Message operations
  async createMessage(message: InsertMessage): Promise<Message> {
    const id = this.messageIdCounter++;
    const now = new Date();
    const newMessage: Message = { 
      ...message, 
      id, 
      isRead: false,
      createdAt: now
    };
    this.messages.set(id, newMessage);
    return newMessage;
  }

  async getUserMessages(userId: number): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(
      (message) => message.toUserId === userId || message.fromUserId === userId,
    );
  }

  async getConversation(user1Id: number, user2Id: number): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(
      (message) => 
        (message.fromUserId === user1Id && message.toUserId === user2Id) ||
        (message.fromUserId === user2Id && message.toUserId === user1Id),
    ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async markMessageAsRead(id: number): Promise<Message | undefined> {
    const message = this.messages.get(id);
    if (!message) return undefined;
    
    const updatedMessage = { ...message, isRead: true };
    this.messages.set(id, updatedMessage);
    return updatedMessage;
  }

  // Notification operations
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const id = this.notificationIdCounter++;
    const now = new Date();
    const newNotification: Notification = { 
      ...notification, 
      id, 
      isRead: false,
      createdAt: now
    };
    this.notifications.set(id, newNotification);
    return newNotification;
  }

  async getUserNotifications(userId: number): Promise<Notification[]> {
    return Array.from(this.notifications.values()).filter(
      (notification) => notification.userId === userId,
    );
  }

  async markNotificationAsRead(id: number): Promise<Notification | undefined> {
    const notification = this.notifications.get(id);
    if (!notification) return undefined;
    
    const updatedNotification = { ...notification, isRead: true };
    this.notifications.set(id, updatedNotification);
    return updatedNotification;
  }

  // Seed some demo data for testing
  private async seedData() {
    // Define seed data here if needed
  }
}

import connectPg from "connect-pg-simple";
import { db, pool } from "./db";
import { eq, and, or, desc, SQL, sql } from "drizzle-orm";
import { JobStatus, ApplicationStatus, UserType, type JobStatusValues, type ApplicationStatusValues, type UserTypeValues } from "@shared/schema";

// PostgreSQL session store setup
const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  sessionStore: any;

  constructor() {
    // Configure PostgreSQL session store with simplified options
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      tableName: 'session',
      createTableIfMissing: true,
      // Remove properties that may not be supported by connect-pg-simple
    });
    
    // Add event listeners for better debugging
    this.sessionStore.on('error', (error: any) => {
      console.error('PostgreSQL session store error:', error);
    });
    
    // Log session store configuration
    console.log('Session store configured with PostgreSQL');
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserRating(userId: number): Promise<User | undefined> {
    const ratings = await this.getUserRatings(userId);
    
    if (ratings.length === 0) {
      return this.getUser(userId);
    }
    
    const averageRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
    
    return this.updateUser(userId, { rating: parseFloat(averageRating.toFixed(1)) });
  }

  async getWorkers(): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(eq(users.userType, UserType.WORKER));
  }

  async getEmployers(): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(eq(users.userType, UserType.EMPLOYER));
  }

  // Worker profile operations
  async createWorkerProfile(profile: InsertWorkerProfile): Promise<WorkerProfile> {
    const [workerProfile] = await db
      .insert(workerProfiles)
      .values(profile)
      .returning();
    return workerProfile;
  }

  async getWorkerProfile(userId: number): Promise<WorkerProfile | undefined> {
    const [profile] = await db
      .select()
      .from(workerProfiles)
      .where(eq(workerProfiles.userId, userId));
    return profile || undefined;
  }

  async updateWorkerProfile(userId: number, profileData: Partial<WorkerProfile>): Promise<WorkerProfile | undefined> {
    const profile = await this.getWorkerProfile(userId);
    if (!profile) return undefined;
    
    const [updatedProfile] = await db
      .update(workerProfiles)
      .set(profileData)
      .where(eq(workerProfiles.id, profile.id))
      .returning();
    return updatedProfile;
  }

  async getWorkerWithProfile(userId: number): Promise<(User & {profile: WorkerProfile | null}) | undefined> {
    const user = await this.getUser(userId);
    if (!user || user.userType !== UserType.WORKER) return undefined;
    
    const profile = await this.getWorkerProfile(userId);
    return { ...user, profile: profile || null };
  }

  // Employer profile operations
  async createEmployerProfile(profile: InsertEmployerProfile): Promise<EmployerProfile> {
    const [employerProfile] = await db
      .insert(employerProfiles)
      .values(profile)
      .returning();
    return employerProfile;
  }

  async getEmployerProfile(userId: number): Promise<EmployerProfile | undefined> {
    const [profile] = await db
      .select()
      .from(employerProfiles)
      .where(eq(employerProfiles.userId, userId));
    return profile || undefined;
  }

  async updateEmployerProfile(userId: number, profileData: Partial<EmployerProfile>): Promise<EmployerProfile | undefined> {
    const profile = await this.getEmployerProfile(userId);
    if (!profile) return undefined;
    
    const [updatedProfile] = await db
      .update(employerProfiles)
      .set(profileData)
      .where(eq(employerProfiles.id, profile.id))
      .returning();
    return updatedProfile;
  }

  async getEmployerWithProfile(userId: number): Promise<(User & {profile: EmployerProfile | null}) | undefined> {
    const user = await this.getUser(userId);
    if (!user || user.userType !== UserType.EMPLOYER) return undefined;
    
    const profile = await this.getEmployerProfile(userId);
    return { ...user, profile: profile || null };
  }

  // Job operations
  async createJob(job: InsertJob): Promise<Job> {
    try {
      // Ensure the employer exists
      const employer = await this.getUser(job.employerId);
      if (!employer) {
        throw new Error(`Employer with ID ${job.employerId} does not exist`);
      }
      
      // Validate status value
      const status = job.status || JobStatus.OPEN;
      if (!Object.values(JobStatus).includes(status as JobStatusValues)) {
        console.warn(`Invalid status provided: ${status}, defaulting to OPEN`);
      }
      
      // Add default values for nullable fields
      const jobData = {
        ...job,
        status: Object.values(JobStatus).includes(status as JobStatusValues) 
          ? status 
          : JobStatus.OPEN,
        skills: job.skills || [],
        hourlyRate: job.hourlyRate || null,
        startDate: job.startDate || null,
        endDate: job.endDate || null,
        createdAt: new Date()
      };
      
      console.log("Creating job with data:", jobData);
      
      const [newJob] = await db
        .insert(jobs)
        .values(jobData)
        .returning();
        
      console.log("Job created successfully:", newJob);
      return newJob;
    } catch (error) {
      console.error("Error creating job:", error);
      throw error;
    }
  }

  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id));
    return job || undefined;
  }

  async getAllJobs(): Promise<Job[]> {
    return db.select().from(jobs);
  }

  async getEmployerJobs(employerId: number): Promise<Job[]> {
    return db
      .select()
      .from(jobs)
      .where(eq(jobs.employerId, employerId));
  }

  async updateJob(id: number, jobData: Partial<Job>): Promise<Job | undefined> {
    const [job] = await db
      .update(jobs)
      .set(jobData)
      .where(eq(jobs.id, id))
      .returning();
    return job;
  }

  async deleteJob(id: number): Promise<void> {
    // First delete all applications for this job
    await db
      .delete(applications)
      .where(eq(applications.jobId, id));
    
    // Then delete the job
    await db
      .delete(jobs)
      .where(eq(jobs.id, id));
  }

  async getMatchedJobsForWorker(workerId: number): Promise<Job[]> {
    const worker = await this.getWorkerWithProfile(workerId);
    if (!worker || !worker.profile || !worker.profile.skills) return [];
    
    // This is a simplified matching algorithm - in a real application we would
    // use more sophisticated approaches including text similarity, etc.
    return db
      .select()
      .from(jobs)
      .where(
        // For simplicity, we're only checking that one of the worker's skills
        // matches one of the job's required skills
        sql`${jobs.skills} && ${worker.profile.skills}::text[]`
      );
  }

  // Application operations
  async createApplication(application: InsertApplication): Promise<Application> {
    const now = new Date();
    try {
      // Handle date conversion properly
      let availableToStart = application.availableToStart;
      if (availableToStart && typeof availableToStart === 'string') {
        availableToStart = new Date(availableToStart);
      }
      
      // Fix application status and convert 'availableToStart' to Date
      const applicationData = {
        ...application,
        availableToStart, // Use the processed date
        status: "pending", // Use string directly to bypass type checking issues
        appliedAt: now,
        updatedAt: now
      };
      
      console.log("Creating application with data:", applicationData);
      
      const [newApplication] = await db
        .insert(applications)
        .values(applicationData)
        .returning();
      
      return newApplication;
    } catch (error) {
      console.error("Error creating application:", error);
      throw error;
    }
  }

  async getApplication(id: number): Promise<Application | undefined> {
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, id));
    return application || undefined;
  }

  async getApplicationByJobAndWorker(jobId: number, workerId: number): Promise<Application | undefined> {
    const [application] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.jobId, jobId),
          eq(applications.workerId, workerId)
        )
      );
    return application || undefined;
  }

  async getWorkerApplications(workerId: number): Promise<Application[]> {
    return db
      .select()
      .from(applications)
      .where(eq(applications.workerId, workerId));
  }

  async getEmployerApplications(employerId: number): Promise<Application[]> {
    // Get all jobs by this employer
    const employerJobs = await this.getEmployerJobs(employerId);
    if (employerJobs.length === 0) return [];
    
    // Using a different approach to construct the query
    console.log(`Getting applications for employer ${employerId} with jobs:`, employerJobs.map(j => j.id));
    
    // Get all applications for those jobs, one by one to avoid SQL issues
    const allApplications: Application[] = [];
    for (const job of employerJobs) {
      const jobApplications = await db
        .select()
        .from(applications)
        .where(eq(applications.jobId, job.id));
      
      console.log(`Found ${jobApplications.length} applications for job ${job.id}`);
      allApplications.push(...jobApplications);
    }
    
    console.log(`Total applications found for employer ${employerId}:`, allApplications.length);
    return allApplications;
  }

  async getJobApplications(jobId: number): Promise<Application[]> {
    return db
      .select()
      .from(applications)
      .where(eq(applications.jobId, jobId));
  }

  async updateApplication(id: number, applicationData: Partial<Application>): Promise<Application | undefined> {
    const [application] = await db
      .update(applications)
      .set({
        ...applicationData,
        updatedAt: new Date()
      })
      .where(eq(applications.id, id))
      .returning();
    return application;
  }

  // Rating operations
  async createRating(rating: InsertRating): Promise<Rating> {
    const [newRating] = await db
      .insert(ratings)
      .values({
        ...rating,
        createdAt: new Date()
      })
      .returning();
    
    // Update the user's average rating
    await this.updateUserRating(rating.toUserId);
    
    return newRating;
  }

  async getUserRatings(userId: number): Promise<Rating[]> {
    return db
      .select()
      .from(ratings)
      .where(eq(ratings.toUserId, userId));
  }

  // Message operations
  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values({
        ...message,
        isRead: false,
        createdAt: new Date()
      })
      .returning();
    return newMessage;
  }

  async getUserMessages(userId: number): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(
        or(
          eq(messages.fromUserId, userId),
          eq(messages.toUserId, userId)
        )
      )
      .orderBy(desc(messages.createdAt));
  }

  async getConversation(user1Id: number, user2Id: number): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(
        or(
          and(
            eq(messages.fromUserId, user1Id),
            eq(messages.toUserId, user2Id)
          ),
          and(
            eq(messages.fromUserId, user2Id),
            eq(messages.toUserId, user1Id)
          )
        )
      )
      .orderBy(desc(messages.createdAt));
  }

  async markMessageAsRead(id: number): Promise<Message | undefined> {
    const [message] = await db
      .update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, id))
      .returning();
    return message;
  }

  // Notification operations
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db
      .insert(notifications)
      .values({
        ...notification,
        isRead: false,
        createdAt: new Date()
      })
      .returning();
    return newNotification;
  }

  async getUserNotifications(userId: number): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async markNotificationAsRead(id: number): Promise<Notification | undefined> {
    const [notification] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }
}

// Use database storage instead of memory storage
export const storage = new DatabaseStorage();
