export const getCardImage = (value: number): string => {
  const imageMap: Record<number, string> = {
    [-2]: "/lovable-uploads/0c465f76-7e3f-4366-bb9b-57f0453a2edd.png",
    [-1]: "/lovable-uploads/0c465f76-7e3f-4366-bb9b-57f0453a2edd.png",
    0: "/lovable-uploads/0c465f76-7e3f-4366-bb9b-57f0453a2edd.png",
    1: "/lovable-uploads/0c465f76-7e3f-4366-bb9b-57f0453a2edd.png",
    2: "/lovable-uploads/0c465f76-7e3f-4366-bb9b-57f0453a2edd.png",
    3: "/lovable-uploads/beb5e6f7-020f-4ada-b87e-71110891e4a1.png",
    4: "/lovable-uploads/beb5e6f7-020f-4ada-b87e-71110891e4a1.png",
    5: "/lovable-uploads/beb5e6f7-020f-4ada-b87e-71110891e4a1.png",
    6: "/lovable-uploads/beb5e6f7-020f-4ada-b87e-71110891e4a1.png",
    7: "/lovable-uploads/beb5e6f7-020f-4ada-b87e-71110891e4a1.png",
    8: "/lovable-uploads/dce2545b-8855-4ad9-93d8-24905077610f.png",
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