import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { UserModel, inMemoryUsers, InMemoryUser } from '../models/User';
import { v4 as uuidv4 } from 'uuid';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'uno-secret-key-super-secure-token-2025';

// Helper to check if MongoDB is active
function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

// 1. REGISTER
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, confirmPassword, avatar } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 20) {
      res.status(400).json({ error: 'Username must be between 3 and 20 characters.' });
      return;
    }

    const trimmedUsername = username.trim();

    if (!password || typeof password !== 'string' || password.length < 4) {
      res.status(400).json({ error: 'Password must be at least 4 characters.' });
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match.' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    if (isMongoConnected()) {
      const existingUser = await UserModel.findOne({
        username: { $regex: new RegExp(`^${trimmedUsername}$`, 'i') },
      });
      if (existingUser) {
        res.status(400).json({ error: 'Username is already taken. Please choose another.' });
        return;
      }

      const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(trimmedUsername)}&backgroundColor=b6e3f4`;
      const newUser = new UserModel({
        username: trimmedUsername,
        password: hashedPassword,
        avatar: avatar || defaultAvatar,
      });
      await newUser.save();

      const token = jwt.sign({ id: newUser._id.toString(), username: newUser.username }, JWT_SECRET, {
        expiresIn: '7d',
      });

      res.status(201).json({
        token,
        user: {
          id: newUser._id.toString(),
          username: newUser.username,
          avatar: newUser.avatar,
          gamesPlayed: newUser.gamesPlayed,
          gamesWon: newUser.gamesWon,
        },
      });
      return;
    } else {
      // In-Memory store fallback
      for (const u of inMemoryUsers.values()) {
        if (u.username.toLowerCase() === trimmedUsername.toLowerCase()) {
          res.status(400).json({ error: 'Username is already taken. Please choose another.' });
          return;
        }
      }

      const id = uuidv4();
      const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(trimmedUsername)}&backgroundColor=b6e3f4`;
      const inMemUser: InMemoryUser = {
        id,
        username: trimmedUsername,
        password: hashedPassword,
        avatar: avatar || defaultAvatar,
        gamesPlayed: 0,
        gamesWon: 0,
        createdAt: new Date(),
      };
      inMemoryUsers.set(id, inMemUser);

      const token = jwt.sign({ id, username: inMemUser.username }, JWT_SECRET, {
        expiresIn: '7d',
      });

      res.status(201).json({
        token,
        user: {
          id: inMemUser.id,
          username: inMemUser.username,
          avatar: inMemUser.avatar,
          gamesPlayed: inMemUser.gamesPlayed,
          gamesWon: inMemUser.gamesWon,
        },
      });
      return;
    }
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Server error during registration' });
  }
});

// 2. LOGIN
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    const trimmedUsername = username.trim();

    if (isMongoConnected()) {
      const user = await UserModel.findOne({
        username: { $regex: new RegExp(`^${trimmedUsername}$`, 'i') },
      });
      if (!user) {
        res.status(400).json({ error: 'Invalid username or password.' });
        return;
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        res.status(400).json({ error: 'Invalid username or password.' });
        return;
      }

      const token = jwt.sign({ id: user._id.toString(), username: user.username }, JWT_SECRET, {
        expiresIn: '7d',
      });

      res.json({
        token,
        user: {
          id: user._id.toString(),
          username: user.username,
          avatar: user.avatar,
          gamesPlayed: user.gamesPlayed,
          gamesWon: user.gamesWon,
        },
      });
      return;
    } else {
      // In-Memory store fallback
      let foundUser: InMemoryUser | undefined;
      for (const u of inMemoryUsers.values()) {
        if (u.username.toLowerCase() === trimmedUsername.toLowerCase()) {
          foundUser = u;
          break;
        }
      }

      if (!foundUser) {
        res.status(400).json({ error: 'Invalid username or password.' });
        return;
      }

      const isMatch = await bcrypt.compare(password, foundUser.password);
      if (!isMatch) {
        res.status(400).json({ error: 'Invalid username or password.' });
        return;
      }

      const token = jwt.sign({ id: foundUser.id, username: foundUser.username }, JWT_SECRET, {
        expiresIn: '7d',
      });

      res.json({
        token,
        user: {
          id: foundUser.id,
          username: foundUser.username,
          avatar: foundUser.avatar,
          gamesPlayed: foundUser.gamesPlayed,
          gamesWon: foundUser.gamesWon,
        },
      });
      return;
    }
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Server error during login' });
  }
});

// 3. ME (Session check)
authRouter.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };

    if (isMongoConnected()) {
      const user = await UserModel.findById(decoded.id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({
        user: {
          id: user._id.toString(),
          username: user.username,
          avatar: user.avatar,
          gamesPlayed: user.gamesPlayed,
          gamesWon: user.gamesWon,
        },
      });
      return;
    } else {
      const user = inMemoryUsers.get(decoded.id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({
        user: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          gamesPlayed: user.gamesPlayed,
          gamesWon: user.gamesWon,
        },
      });
      return;
    }
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// 4. Update Profile Picture
authRouter.patch('/avatar', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    const { avatar } = req.body;

    if (isMongoConnected()) {
      const user = await UserModel.findByIdAndUpdate(decoded.id, { avatar }, { new: true });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json({ success: true, avatar: user.avatar });
      return;
    } else {
      const user = inMemoryUsers.get(decoded.id);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      user.avatar = avatar;
      res.json({ success: true, avatar: user.avatar });
      return;
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});

