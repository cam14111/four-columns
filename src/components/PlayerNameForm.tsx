import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface PlayerNameFormProps {
  onSubmit: (name: string) => void;
}

export const PlayerNameForm = ({ onSubmit }: PlayerNameFormProps) => {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast({
        title: "Nom invalide",
        description: "Le nom doit contenir au moins 2 caractères",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    onSubmit(name.trim());
    setIsLoading(false);
  };

  return (
    <div className="max-w-sm mx-auto mt-8">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-center">Bienvenue sur Skyjo</h2>
          <p className="text-center text-gray-600">
            Entrez votre nom pour commencer
          </p>
        </div>
        <Input
          type="text"
          placeholder="Votre nom"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full"
          disabled={isLoading}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Vérification..." : "Commencer"}
        </Button>
      </form>
    </div>
  );
};