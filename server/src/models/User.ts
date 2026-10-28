import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  password: string;
  avatar: string;
  gamesPlayed: number;
  gamesWon: number;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
      default: '',
    },
    gamesPlayed: {
      type: Number,
      default: 0,
    },
    gamesWon: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'uno_users', // Dedicated collection to prevent conflicts with legacy 'users' collections
  }
);

export const UserModel = mongoose.model<IUser>('UnoUser', UserSchema, 'uno_users');

// In-Memory user storage fallback for dev/testing when MongoDB is not connected
export interface InMemoryUser {
  id: string;
  username: string;
  password: string;
  avatar: string;
  gamesPlayed: number;
  gamesWon: number;
  createdAt: Date;
}

export const inMemoryUsers: Map<string, InMemoryUser> = new Map();
