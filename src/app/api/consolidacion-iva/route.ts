import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { writeFile, readFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

export const runtime = "nodejs";
export const maxDuration = 120;

// En Windows el comando del proyecto es python3 (no python)
const PY = "python3";
const SCRIPT = join(process.cwd(), "src", "lib", "consolidacion-iva", "consolidar_iva.py");

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const listado = form.get("listado") as File | null;
  const xmls = form.get("xmls") as File | null; // .zip o .xml opcional

  if (!listado) {
    return NextResponse.json({ error: "Falta el listado de la DIAN (token dian)." }, { status: 400 });
  }

  const dir = await mkdtemp(join(tmpdir(), "cala-iva-"));
  try {
    const listadoPath = join(dir, "listado.xlsx");
    const salidaPath = join(dir, "consolidacion_iva.xlsx");
    await writeFile(listadoPath, Buffer.from(await listado.arrayBuffer()));

    const args = [SCRIPT, listadoPath, salidaPath];
    if (xmls) {
      const xmlPath = join(dir, xmls.name.toLowerCase().endsWith(".zip") ? "xmls.zip" : "doc.xml");
      await writeFile(xmlPath, Buffer.from(await xmls.arrayBuffer()));
      args.push(xmlPath);
    }

    const resumen = await runPython(args);
    const bytes = await readFile(salidaPath);

    // Uint8Array (no Buffer) para la respuesta
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="consolidacion_iva.xlsx"',
        // resumen (filas, excluidas, con_xml, asumidas) para mostrar en la UI
        "X-Resumen": Buffer.from(resumen).toString("base64"),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error procesando el archivo." }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, args, { env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(err || `python salió con código ${code}`))
    );
  });
}