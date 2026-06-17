import { motion } from "framer-motion";
import { Star } from "lucide-react";

export default function StarToggle({ menuOpen, toggleMenu }) {
  return (
    <motion.button
      onClick={toggleMenu}
      animate={{ 
        x: menuOpen ? 335 : 0, // Décalage augmenté à 335px pour suivre le menu de 320px
        rotate: menuOpen ? 180 : 0
      }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className={`fixed top-5 left-5 z-[60] p-2 rounded-xl border transition-colors ${
        menuOpen 
          ? "text-amber-400 bg-amber-500/10 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]" 
          : "text-white/40 bg-white/[0.02] border-white/10 hover:text-amber-400 hover:border-amber-500/30"
      }`}
    >
      <Star size={18} className={menuOpen ? "fill-current" : ""} />
    </motion.button>
  );
}