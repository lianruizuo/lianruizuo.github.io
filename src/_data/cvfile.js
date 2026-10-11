// The CV link appears only once the PDF is in src/files/.
import fs from "node:fs";
export default function () {
  return { exists: fs.existsSync("src/files/LianruiZuo_CV.pdf") };
}
