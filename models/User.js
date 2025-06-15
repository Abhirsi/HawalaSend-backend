// backend/models/User.js
const pool = require('../db');
const logger = require('../utils/logger');

class User {
  static async create({ email, password, name }) {
    const query = `
      INSERT INTO users (email, password, name)
      VALUES ($1, $2, $3)
      RETURNING id, email, name
    `;
    const values = [email, password, name];
    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  static async findByEmail(email) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return rows[0];
  }
}

module.exports = User;