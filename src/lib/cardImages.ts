export const getCardImage = (value: number): string => {
  const imageMap: Record<number, string> = {
    [-2]: "/lovable-uploads/c619e4d7-764c-4514-a0db-91bd9d40e56b.png", // carte -2 (bleue)
    [-1]: "/lovable-uploads/ee3dd288-4125-414d-b90c-da2d257730a6.png", // carte -1 (bleue)
    0: "/lovable-uploads/a5b03ab7-c771-46ff-9941-a9615e506083.png",    // carte 0 (bleue)
    1: "/lovable-uploads/44265872-3a79-4e74-93be-6107b64bb8e3.png",    // carte 1 (verte)
    2: "/lovable-uploads/8a155917-6861-4754-b719-1504f0f63cc8.png",    // carte 2 (verte)
    3: "/lovable-uploads/32bbaff1-47f1-4344-996a-dba93db5976c.png",    // carte 3 (verte)
    4: "/lovable-uploads/06a7325f-d248-4f73-8290-914f096c41bf.png",    // carte 4 (verte)
    5: "/lovable-uploads/d7292c90-7576-4b07-8596-ce9f9c22c35e.png",    // carte 5 (jaune)
    6: "/lovable-uploads/2ab5eb44-124e-4145-9a03-1b19ab257fce.png",    // carte 6 (jaune)
    7: "/lovable-uploads/034cef01-c8cb-42dc-a66d-3cf8fc643c28.png",    // carte 7 (jaune)
    8: "/lovable-uploads/0c97cd57-ade2-4066-aded-192491d63fcb.png",    // carte 8 (jaune)
    9: "/lovable-uploads/205efbc6-519d-40a7-81ee-971c3a611b95.png",    // carte 9 (rouge)
    10: "/lovable-uploads/d666db56-ba8c-48f1-8e46-6c2023a5194b.png",   // carte 10 (rouge)
    11: "/lovable-uploads/58b84ed4-4ad2-42fc-98ba-c91ae2764bb6.png",   // carte 11 (rouge)
    12: "/lovable-uploads/86e47882-7f71-4d53-9c31-d1534607ac94.png",   // carte 12 (rouge)
  };
  return imageMap[value];
};

export const getCardBackImage = (): string => {
  return "/lovable-uploads/8bfabeb0-b2be-438b-b8ad-341021677f44.png";
};