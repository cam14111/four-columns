// Base URL for the application
export const BASE_URL = window.location.origin;

// Helper function to build API URLs
export const buildApiUrl = (path: string) => {
  const url = new URL(path, BASE_URL);
  return url.toString();
};