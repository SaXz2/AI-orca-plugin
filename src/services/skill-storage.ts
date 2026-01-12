/**
 * Skill Storage Module - IndexedDB Implementation
 * 
 * This module provides persistent storage for skills using IndexedDB.
 * It implements the storage layer for the Codex-style skill system.
 * 
 * Requirements: 1.1, 1.2
 */

import type { SkillDefinition, SkillMetadata } from "../types/skill";

/** Database name for skill storage */
const DB_NAME = "skill-store";

/** Object store name for skills */
const STORE_NAME = "skills";

/** Current database version */
const DB_VERSION = 1;

/** Cached database instance */
let dbInstance: IDBDatabase | null = null;

/**
 * Stored skill structure in IndexedDB
 */
export interface StoredSkill {
  id: string;
  name: string;
  description: string;
  instruction: string;
  source: "built-in" | "user";
  createdAt: number;
  updatedAt: number;
}

/**
 * Opens or creates the IndexedDB database.
 * Creates the skills object store if it doesn't exist.
 * 
 * @returns Promise resolving to the database instance
 */
function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open database: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      
      // Handle database close/error to clear cached instance
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      dbInstance.onerror = () => {
        dbInstance = null;
      };
      
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create skills object store with id as key path
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        
        // Create indexes for common queries
        store.createIndex("name", "name", { unique: false });
        store.createIndex("source", "source", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };
  });
}

/**
 * Converts a SkillDefinition to StoredSkill format for IndexedDB.
 * 
 * @param skill - The skill definition to convert
 * @returns StoredSkill object
 */
function toStoredSkill(skill: SkillDefinition): StoredSkill {
  return {
    id: skill.id,
    name: skill.metadata.name,
    description: skill.metadata.description,
    instruction: skill.instruction,
    source: skill.source,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  };
}

/**
 * Converts a StoredSkill from IndexedDB to SkillDefinition format.
 * 
 * @param stored - The stored skill to convert
 * @returns SkillDefinition object
 */
function fromStoredSkill(stored: StoredSkill): SkillDefinition {
  return {
    id: stored.id,
    metadata: {
      name: stored.name,
      description: stored.description,
    },
    instruction: stored.instruction,
    source: stored.source,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

/**
 * Saves a skill to IndexedDB.
 * If a skill with the same id exists, it will be overwritten.
 * 
 * @param skill - The skill definition to save
 * @returns Promise that resolves when the skill is saved
 * @throws Error if the storage operation fails
 * 
 * Requirements: 1.1
 */
export async function saveSkill(skill: SkillDefinition): Promise<void> {
  const db = await openDatabase();
  const stored = toStoredSkill(skill);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(stored);

    request.onerror = () => {
      reject(new Error(`Failed to save skill: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

/**
 * Retrieves a skill from IndexedDB by id.
 * 
 * @param id - The unique identifier of the skill
 * @returns Promise resolving to the skill definition, or null if not found
 * @throws Error if the storage operation fails
 * 
 * Requirements: 1.2
 */
export async function getSkill(id: string): Promise<SkillDefinition | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onerror = () => {
      reject(new Error(`Failed to get skill: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      const stored = request.result as StoredSkill | undefined;
      resolve(stored ? fromStoredSkill(stored) : null);
    };
  });
}

/**
 * Retrieves all skills from IndexedDB.
 * 
 * @returns Promise resolving to an array of all skill definitions
 * @throws Error if the storage operation fails
 * 
 * Requirements: 1.2
 */
export async function getAllSkills(): Promise<SkillDefinition[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error(`Failed to get all skills: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      const storedSkills = request.result as StoredSkill[];
      resolve(storedSkills.map(fromStoredSkill));
    };
  });
}

/**
 * Deletes a skill from IndexedDB by id.
 * 
 * @param id - The unique identifier of the skill to delete
 * @returns Promise that resolves when the skill is deleted
 * @throws Error if the storage operation fails
 * 
 * Requirements: 1.1
 */
export async function deleteSkill(id: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => {
      reject(new Error(`Failed to delete skill: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

/**
 * Checks if a skill exists in IndexedDB by id.
 * 
 * @param id - The unique identifier of the skill
 * @returns Promise resolving to true if the skill exists, false otherwise
 */
export async function skillExists(id: string): Promise<boolean> {
  const skill = await getSkill(id);
  return skill !== null;
}

/**
 * Clears all skills from IndexedDB.
 * Use with caution - this removes all stored skills.
 * 
 * @returns Promise that resolves when all skills are cleared
 */
export async function clearAllSkills(): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onerror = () => {
      reject(new Error(`Failed to clear skills: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

/**
 * Gets the count of skills in IndexedDB.
 * 
 * @returns Promise resolving to the number of stored skills
 */
export async function getSkillCount(): Promise<number> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();

    request.onerror = () => {
      reject(new Error(`Failed to count skills: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

/**
 * Closes the database connection.
 * Useful for cleanup or testing.
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Deletes the entire database.
 * Use with extreme caution - this removes all data permanently.
 * 
 * @returns Promise that resolves when the database is deleted
 */
export async function deleteDatabase(): Promise<void> {
  closeDatabase();

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onerror = () => {
      reject(new Error(`Failed to delete database: ${request.error?.message}`));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}
