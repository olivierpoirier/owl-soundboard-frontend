import { motion, AnimatePresence } from "framer-motion";
import { Bell } from "lucide-react";

export default function Notification({ notification }) {
  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed top-5 left-1/2 -translate-x-1/2 bg-[#130f22]/90 backdrop-blur-md border border-purple-500/30 text-purple-200 px-4 py-2.5 rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.5)] text-xs font-semibold z-50 flex items-center gap-2 max-w-sm"
        >
          <Bell size={14} className="text-purple-400 shrink-0" />
          <span>{notification}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}