
import { useState } from "react";
import api from "./api/axios";

export default function ApiTest() {
  const [message, setMessage] = useState("Not tested");
  const [loading, setLoading] = useState(false);

  async function testConnection() {
    setLoading(true);
    setMessage("Connecting to Django...");

    try {
      const response = await api.get("/");
      setMessage(
        `Django responded successfully: ${JSON.stringify(response.data)}`
      );
    } catch (error) {
      if (error.response) {
        setMessage(
          `Django responded with HTTP ${error.response.status}. Check the API URL.`
        );
      } else {
        setMessage(
          "Connection failed. Check that Django is running and the API URL is correct."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h2>React + Django Connection Test</h2>
      <button onClick={testConnection} disabled={loading}>
        {loading ? "Testing..." : "Test API Connection"}
      </button>
      <p>{message}</p>
    </div>
  );
}
