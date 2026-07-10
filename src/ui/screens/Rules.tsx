import { CardValue } from "@/game/types";
import { PlayingCard } from "../PlayingCard";

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="mb-5">
    <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide text-amber-300">
      {title}
    </h3>
    <div className="space-y-2 text-sm leading-relaxed text-white/80">
      {children}
    </div>
  </section>
);

export const Rules = () => (
  <div>
    <Section title="But du jeu">
      <p>
        Chaque manche, obtenez le plus petit total de cartes possible. La partie
        se joue en plusieurs manches ; dès qu'un joueur atteint la{" "}
        <strong>limite de score</strong> (100 points par défaut, réglable dans
        les réglages), la partie s'arrête et le plus petit total l'emporte.
      </p>
    </Section>

    <Section title="La grille">
      <p>
        Vous avez 12 cartes disposées en <strong>4 colonnes de 3</strong>. Au
        départ, vous en retournez 2 de votre choix. Les valeurs vont de{" "}
        <strong>−2 à 12</strong>.
      </p>
      <div className="flex gap-1.5 py-1">
        {([-2, 0, 4, 8, 12] as CardValue[]).map((v) => (
          <PlayingCard key={v} card={{ id: `r${v}`, value: v, faceUp: true }} size="sm" />
        ))}
      </div>
    </Section>

    <Section title="Votre tour">
      <p>À votre tour, deux options :</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Piocher</strong> une carte (pioche ou défausse) puis la{" "}
          <strong>placer</strong> à la place d'une carte de votre grille (l'ancienne
          part à la défausse).
        </li>
        <li>
          Si vous piochez de la pioche, vous pouvez la <strong>défausser</strong> et à
          la place <strong>retourner</strong> une de vos cartes cachées.
        </li>
      </ul>
    </Section>

    <Section title="Vider une colonne">
      <p>
        Si les <strong>3 cartes d'une colonne</strong> sont identiques et visibles,
        elles sont <strong>défaussées</strong> : la colonne disparaît et ne compte plus
        rien. Une excellente façon d'effacer de grosses valeurs ! Cela vaut
        aussi pour les colonnes complétées par la <strong>révélation finale</strong> en
        fin de manche.
      </p>
    </Section>

    <Section title="Fin de manche">
      <p>
        Dès qu'un joueur retourne sa <strong>dernière carte</strong>, chaque autre
        joueur joue <strong>un dernier tour</strong>, puis on compte les points.
      </p>
      <p>
        <strong>Attention :</strong> si le joueur qui a terminé n'a pas le plus petit
        score de la manche, son score est <strong>doublé</strong> (sauf s'il est nul ou
        négatif).
      </p>
    </Section>

    <Section title="Conseils">
      <ul className="list-disc space-y-1 pl-5">
        <li>Les cartes −2, −1 et 0 sont précieuses : gardez-les.</li>
        <li>Alignez trois valeurs identiques pour effacer une colonne.</li>
        <li>Ne terminez la manche que si vous êtes sûr d'avoir le plus petit total.</li>
      </ul>
    </Section>
  </div>
);
