import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, ChevronDown, ChevronUp } from "lucide-react";

export default function HelpSection({ helpOpen, setHelpOpen }) {
  return (
    <div className="w-full max-w-[380px]">
      <button
        onClick={() => setHelpOpen(!helpOpen)}
        className="flex items-center justify-center gap-1.5 mx-auto text-white/40 hover:text-purple-400 transition-colors text-[11px] font-semibold tracking-wide uppercase"
      >
        <HelpCircle size={13} />
        <span>Guide de fonctionnement</span>
        {helpOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      <AnimatePresence>
        {helpOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 p-3.5 bg-white/[0.01] border border-white/5 rounded-xl space-y-2 text-left text-xs text-white/50 leading-relaxed font-medium">
              <p className="flex items-start gap-2"><span className="text-purple-400 font-bold">▪</span> Bouton <span className="text-purple-300">Play</span> : Déclenche le fichier audio de manière synchrone pour la table entière.</p>
              <p className="flex items-start gap-2"><span className="text-purple-400 font-bold">▪</span> Activer l'audio : Certains navigateurs demandent un clic dans l'extension avant de permettre les sons automatiques.</p>
              <p className="flex items-start gap-2"><span className="text-purple-400 font-bold">▪</span> Icône <span className="text-emerald-300">Clock</span> : Sauvegarde un délai individuel de répétition en minutes et secondes.</p>
              <p className="flex items-start gap-2"><span className="text-purple-400 font-bold">▪</span> Icône <span className="text-emerald-300">Repeat</span> : Lance une seule boucle active par son; vert signifie actif, recliquer arrête cette boucle.</p>
              <p className="flex items-start gap-2"><span className="text-purple-400 font-bold">▪</span> Terminal audio : Affiche qui a joué, bouclé ou arrêté un son.</p>
              <p className="flex items-start gap-2"><span className="text-purple-400 font-bold">▪</span> Les boucles actives sont restaurées automatiquement pour les joueurs qui rejoignent la salle plus tard.</p>
              <p className="flex items-start gap-2"><span className="text-purple-400 font-bold">▪</span> Icône <span className="text-purple-300">Headphones</span> : Pré-écoute locale exclusive (idéal pour la préparation du MJ).</p>
              <p className="flex items-start gap-2"><span className="text-purple-400 font-bold">▪</span> Icône <span className="text-amber-400">Star</span> : Indexation du son ou dossier associé dans le panneau des favoris.</p>
              <p className="flex items-start gap-2"><span className="text-purple-400 font-bold">▪</span> Ajouter un dossier : Crée un sous-dossier Dropbox dans le chemin affiché.</p>
              <p className="flex items-start gap-2"><span className="text-purple-400 font-bold">▪</span> Molette de Volume : Ajustement du gain de sortie local (sans incidence sur l'auditoire).</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
