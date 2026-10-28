const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (
  window.location.hostname === 'localhost' ? 'http://localhost:5000' : ''
);

export interface AuthUser {
  id: string;
  username: string;
  avatar: string;
  gamesPlayed?: number;
  gamesWon?: number;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

const TOKEN_KEY = 'uno_auth_token';

export const api = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },

  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  },

  async register(params: {
    username: string;
    password: string;
    confirmPassword: string;
    avatar?: string;
  }): Promise<AuthResponse> {
    const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  },

  async login(params: { username: string; password: string }): Promise<AuthResponse> {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  },

  async getMe(): Promise<AuthUser | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        this.clearToken();
        return null;
      }

      const data = await res.json();
      return data.user;
    } catch {
      return null;
    }
  },

  async updateAvatar(avatar: string): Promise<string> {
    const token = this.getToken();
    if (!token) throw new Error('Not logged in');

    const res = await fetch(`${BACKEND_URL}/api/auth/avatar`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ avatar }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update avatar');
    }
    return data.avatar;
  },
};

