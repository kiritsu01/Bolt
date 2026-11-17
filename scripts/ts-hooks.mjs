// Aggancio per `npm test`: permette a Node di importare i file .ts di src/ senza estensione
// e con l'alias "@/". Nessuna dipendenza esterna (Node 22+ con --experimental-strip-types).
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const SRC = pathToFileURL(resolvePath(import.meta.dirname, "../src") + "/").href;

registerHooks({
  resolve(specifier, context, next) {
    let spec = specifier;
    if (spec.startsWith("@/")) spec = SRC + spec.slice(2);
    try {
      return next(spec, context);
    } catch (err) {
      if (spec.startsWith(".") || spec.startsWith("file:")) {
        for (const ext of [".ts", ".tsx"]) {
          try {
            return next(spec + ext, context);
          } catch {
            /* prova la prossima */
          }
        }
      }
      throw err;
    }
  },
});
