export const getCardImage = (value: number): string => {
  const imageMap: Record<number, string> = {
    [-2]: "/lovable-uploads/c619e4d7-764c-4514-a0db-91bd9d40e56b.png", // carte -2 (bleue)
    [-1]: "/lovable-uploads/ee3dd288-4125-414d-b90c-da2d257730a6.png", // carte -1 (bleue)
    0: "/lovable-uploads/a5b03ab7-c771-46ff-9941-a9615e506083.png",    // carte 0 (bleue)
    1: "/lovable-uploads/44265872-3a79-4e74-93be-6107b64bb8e3.png",    // carte 1 (verte)
    2: "/lovable-uploads/8a155917-6861-4754-b719-1504f0f63cc8.png",    // carte 2 (verte)
    3: "/lovable-uploads/ae135b2d-18b7-458c-a018-b3e01bf8f946.png",    // carte 3 (verte)
    4: "/lovable-uploads/0247d3fc-249f-407c-84bf-2bc2b11d441c.png",    // carte 4 (verte)
    5: "/lovable-uploads/574a7e83-ed9e-4906-a141-0191001cb8b6.png",    // carte 5 (jaune)
    6: "/lovable-uploads/965b3795-c0f9-47ef-8557-893ba4d7ffb5.png",    // carte 6 (jaune)
    7: "/lovable-uploads/6e18ca71-0a17-457f-a0cb-92f67ffe64a9.png",    // carte 7 (jaune)
    8: "/lovable-uploads/6fd11f58-c633-4381-87b1-ce04a3086b6b.png",    // carte 8 (jaune)
    9: "/lovable-uploads/fb51b023-3025-4b93-93a7-2e9775223fb4.png",    // carte 9 (rouge)
    10: "/lovable-uploads/3f13bfee-c938-4ab4-95fb-2068e8e4c797.png",   // carte 10 (rouge)
    11: "/lovable-uploads/8b908bcb-5a79-4317-8d94-135c7a020a8e.png",   // carte 11 (rouge)
    12: "/lovable-uploads/2c1c4cce-3c2e-4562-bfe0-5d33b5d98038.png",   // carte 12 (rouge)
  };
  return imageMap[value];
};

export const getCardBackImage = (): string => {
  return "/lovable-uploads/8bfabeb0-b2be-438b-b8ad-341021677f44.png";
};