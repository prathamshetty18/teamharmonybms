const API_BASE_URL = 'http://127.0.0.1:8000/api';

const TOKEN_KEY = 'bhoomi_setu_token';
const USER_KEY = 'bhoomi_setu_user';

export const authService = {
  getStoredToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  getStoredUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  setSession(token, user) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  async login(identifier, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed. Please verify your credentials.');
      }

      // Fetch full profile
      this.setSession(data.access_token, data.user);
      const fullProfile = await this.getCurrentUser(data.access_token);
      const activeUser = fullProfile || data.user;
      this.setSession(data.access_token, activeUser);

      return {
        accessToken: data.access_token,
        tokenType: data.token_type,
        user: activeUser,
      };
    } catch (err) {
      throw err;
    }
  },

  async registerCitizen(formData) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle validation errors from Pydantic
        if (Array.isArray(data.detail)) {
          const firstErr = data.detail[0]?.msg || 'Validation failed';
          throw new Error(firstErr);
        }
        throw new Error(data.detail || 'Registration failed');
      }

      return data;
    } catch (err) {
      throw err;
    }
  },

  async getCurrentUser(explicitToken = null) {
    const token = explicitToken || this.getStoredToken();
    if (!token) return null;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401 || response.status === 403) {
        this.clearSession();
        return null;
      }

      if (!response.ok) {
        return null;
      }

      const user = await response.json();
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return user;
    } catch (err) {
      console.warn('Could not fetch current user:', err);
      return this.getStoredUser();
    }
  },

  async logout() {
    const token = this.getStoredToken();
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch {
        // Continue clearing local state regardless of network response
      }
    }
    this.clearSession();
  },
};
