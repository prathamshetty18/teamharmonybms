import http from './http';

const TOKEN_KEY = 'token';
const USER_KEY = 'bhoomi_setu_user';

export const auth = {
  async login(contactOrIdentifier, password) {
    const payload = {
      contact: contactOrIdentifier,
      name: contactOrIdentifier,
      username: contactOrIdentifier,
      password
    };
    const data = await http.post('/api/auth/login', payload);
    const token = data.token || data.jwt || data.access_token;
    const user = data.user || { name: data.name, role: data.role, id: data.userId };

    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem('auth_token', token);
      localStorage.setItem('bhoomi_setu_token', token);
    }
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    return { token, user };
  },

  async signup(userData) {
    const data = await http.post('/api/auth/signup', userData);
    return data;
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('bhoomi_setu_token');
    localStorage.removeItem(USER_KEY);
  },

  getCurrentUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  getToken() {
    return localStorage.getItem(TOKEN_KEY) || 
           localStorage.getItem('auth_token') || 
           localStorage.getItem('bhoomi_setu_token');
  }
};

export default auth;
