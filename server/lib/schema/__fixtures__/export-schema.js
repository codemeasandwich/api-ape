/**
 * @fileoverview Test fixture for export-based schema extraction
 */

module.exports = async function createUser({ name, email }) {
  return { id: "123", name, email, createdAt: new Date() };
};

module.exports.schema = {
  input: {
    name: { type: "string", required: true },
    email: { type: "string", required: true },
  },
  output: {
    id: "string",
    name: "string",
    email: "string",
    createdAt: "Date",
  },
  description: "Create a new user",
};
