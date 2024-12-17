export const getCardImage = (value: number): string => {
  const imageMap: Record<number, string> = {
    [-2]: "/lovable-uploads/9b09748f-b724-4887-8c32-200f2881b32b.png", // carte -2 (bleue)
    [-1]: "/lovable-uploads/6ab1b934-bd9f-49aa-94f6-ea1d250ce134.png", // carte -1 (bleue)
    0: "/lovable-uploads/73e6ff73-3a31-41c3-864d-76f36d3c4f0a.png",    // carte 0 (bleue)
    1: "/lovable-uploads/34529e39-9b12-453a-82a2-9b4293a15a34.png",    // carte 1 (verte)
    2: "/lovable-uploads/9f913513-2a61-4fd5-b2cb-47b208ef7045.png",    // carte 2 (verte)
    3: "/lovable-uploads/beb5e6f7-020f-4ada-b87e-71110891e4a1.png",    // orange pour les valeurs 3-7
    4: "/lovable-uploads/beb5e6f7-020f-4ada-b87e-71110891e4a1.png",
    5: "/lovable-uploads/beb5e6f7-020f-4ada-b87e-71110891e4a1.png",
    6: "/lovable-uploads/beb5e6f7-020f-4ada-b87e-71110891e4a1.png",
    7: "/lovable-uploads/beb5e6f7-020f-4ada-b87e-71110891e4a1.png",
    8: "/lovable-uploads/dce2545b-8855-4ad9-93d8-24905077610f.png",    // rouge pour les valeurs 8-12
    9: "/lovable-uploads/dce2545b-8855-4ad9-93d8-24905077610f.png",
    10: "/lovable-uploads/dce2545b-8855-4ad9-93d8-24905077610f.png",
    11: "/lovable-uploads/dce2545b-8855-4ad9-93d8-24905077610f.png",
    12: "/lovable-uploads/dce2545b-8855-4ad9-93d8-24905077610f.png",
  };
  return imageMap[value];
};

export const getCardBackImage = (): string => {
  return "/lovable-uploads/8bfabeb0-b2be-438b-b8ad-341021677f44.png";
};