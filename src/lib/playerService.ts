import { supabase } from "@/integrations/supabase/client";

export const isPlayerAuthorized = async (playerName: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from('authorized_players')
    .select('player_name')
    .eq('player_name', playerName)
    .single();

  if (error) {
    console.error('Error checking player authorization:', error);
    return false;
  }

  return !!data;
};