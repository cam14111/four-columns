import { useToast } from "@/hooks/use-toast";

export const useErrorHandler = () => {
  const { toast } = useToast();

  const handleError = (error: unknown) => {
    console.error('Error caught:', error);
    
    const errorMessage = error instanceof Error 
      ? error.message 
      : "Une erreur inattendue s'est produite";

    toast({
      variant: "destructive",
      title: "Erreur",
      description: errorMessage,
    });
  };

  return { handleError };
};