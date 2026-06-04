export const API_URL = import.meta.env.VITE_GAS_URL || '';

export const callApi = async (data) => {
  if (!API_URL) {
    throw new Error("URL API (VITE_GAS_URL) belum diatur di file .env");
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(data),
    });
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Terjadi kesalahan pada server");
    }
    
    return result;
  } catch (err) {
    console.error("API Error:", err);
    throw err;
  }
};
