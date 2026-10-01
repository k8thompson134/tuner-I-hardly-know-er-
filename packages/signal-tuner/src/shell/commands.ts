// What the MS-DOS Prompt and the Run box say. Pure functions with all the copy
// in one place, so it can be rewritten without touching the windows.

export const DOS_PROMPT = "C:\\>";
export const DOS_BANNER = [
  "Signal OS [Version 4.10.1998]",
  "(C) Copyright Signal Corp 1981-1998.",
  "",
];

export interface DosResult {
  lines: string[];
  clear?: boolean;
  exit?: boolean;
  // A window for the desktop to open.
  open?: string;
  // Something ghostfreq says about it, once.
  remark?: { key: string; text: string };
}

const HYDROGEN = [
  "1420.405751768",
  "the hydrogen line. the quietest place on the dial.",
  "everyone who listens for us listens here.",
];

const PING_GHOST = [
  "Pinging ghostfreq_01 [1420.405.751.768] with 32 bytes of data:",
  "",
  "Reply from 1420.405.751.768: bytes=32 time=480ms TTL=1",
  "Reply from 1420.405.751.768: bytes=32 time=480ms TTL=1",
  "Reply from 1420.405.751.768: bytes=32 time=481ms TTL=1",
  "Reply from 1420.405.751.768: bytes=32 time=480ms TTL=1",
  "",
  "Ping statistics for 1420.405.751.768:",
  "    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),",
  "Approximate round trip times in milli-seconds:",
  "    Minimum = 480ms, Maximum = 481ms, Average = 480ms",
];

const TRACERT_GHOST = [
  "Tracing route to ghostfreq_01 [1420.405.751.768]",
  "over a maximum of 30 hops:",
  "",
  "  1   148 ms   modem.signal.isp",
  "  2   151 ms   gw1.signal.isp",
  "  3   160 ms   backbone.mil",
  "  4   331 ms   uplink.dish.local",
  "  5   480 ms   geostationary.relay",
  "  6     *      (it's shy)",
  "  7   480 ms   ghostfreq_01",
  "",
  "Trace complete.",
];

const FILES: Record<string, string[]> = {
  "readme.txt": [
    "SIGNAL OS 4.10",
    "--------------",
    "things that are true:",
    "  the dial is on 600",
    "  the static is not your fault",
    "  it is shy",
    "",
    "if you can read this you are a fellow listener.",
  ],
  "signal.sys": [
    "MZ.......   (binary file)",
    "",
    "1,412 listens logged.",
    "do not include this number.",
  ],
  "1420.dat": HYDROGEN,
  "command.com": ["You are already in it."],
};

const DIR = [
  " Volume in drive C is SIGNAL",
  " Volume Serial Number is 1420-0314",
  "",
  " Directory of C:\\",
  "",
  "COMMAND  COM        93,890  03-14-01   3:14a",
  "README   TXT           212  03-14-01   3:14a",
  "SIGNAL   SYS         1,412  03-14-01   3:14a",
  "1420     DAT            12  03-14-01   3:14a",
  "         4 file(s)         95,526 bytes",
  "         0 dir(s)   1,420,000 bytes free",
];

const isGhost = (t: string | undefined) =>
  t != null && /^(ghostfreq(_01)?|1420)$/i.test(t);

export function runDos(input: string, clock: string): DosResult {
  const [first, ...args] = input.trim().split(/\s+/);
  const cmd = (first ?? "").toLowerCase();
  const arg = args[0]?.toLowerCase();

  switch (cmd) {
    case "":
      return { lines: [] };
    case "help":
    case "?":
      return {
        lines: [
          "Commands:",
          "  CLS    DATE   DIR    ECHO   EXIT",
          "  HELP   MEM    PING   TIME   TRACERT",
          "  TYPE   VER    WHOAMI",
        ],
      };
    case "cls":
      return { lines: [], clear: true };
    case "exit":
      return { lines: [], exit: true };
    case "ver":
      return { lines: ["Signal OS [Version 4.10.1998]"] };
    case "date":
      return { lines: ["Current date is Wed 03-14-2001"] };
    case "time":
      return { lines: [`Current time is ${clock}`] };
    case "whoami":
      return { lines: ["sk8rgrl_3am"] };
    case "echo":
      return { lines: [args.join(" ")] };
    case "dir":
      return { lines: DIR };
    case "mem":
      return {
        lines: [
          "  655,360 bytes total conventional memory",
          "    1,412 bytes in use by SIGNAL.SYS",
          "  every other byte: waiting",
        ],
      };
    case "cd":
    case "chdir":
      return { lines: [args.length === 0 ? "C:\\" : "Invalid directory"] };
    case "type": {
      if (arg == null) return { lines: ["Required parameter missing"] };
      const name = FILES[arg] ? arg : `${arg}.txt`;
      const file = FILES[name];
      if (file == null) return { lines: ["File not found - " + args[0].toUpperCase()] };
      return name === "1420.dat"
        ? { lines: file, remark: { key: "dos-1420", text: "...how do u know that name" } }
        : { lines: file };
    }
    case "1420":
      return {
        lines: HYDROGEN,
        remark: { key: "dos-1420", text: "...how do u know that name" },
      };
    case "ping":
      if (arg == null) return { lines: ["Usage: ping hostname"] };
      if (isGhost(arg)) {
        return {
          lines: PING_GHOST,
          remark: { key: "ping", text: "did u just ping me. rude. (hi)" },
        };
      }
      if (arg === "localhost" || arg === "127.0.0.1") {
        return {
          lines: [
            "Reply from 127.0.0.1: bytes=32 time<1ms TTL=128",
            "Reply from 127.0.0.1: bytes=32 time<1ms TTL=128",
            "Reply from 127.0.0.1: bytes=32 time<1ms TTL=128",
            "Reply from 127.0.0.1: bytes=32 time<1ms TTL=128",
          ],
        };
      }
      return { lines: [`Unknown host ${args[0]}.`] };
    case "tracert":
      if (isGhost(arg)) return { lines: TRACERT_GHOST };
      return { lines: [arg == null ? "Usage: tracert hostname" : `Unable to resolve target system name ${args[0]}.`] };
    case "format":
      return {
        lines: ["Cannot format drive C:. The drive is in use by ghostfreq_01."],
        remark: { key: "format", text: "pls no. my drafts are on there" },
      };
    case "del":
    case "erase":
    case "deltree":
    case "rd":
    case "rmdir":
      return { lines: ["Access denied. The file is in use by another program.", "(it is the dish)"] };
    case "ghostfreq":
    case "ghostfreq_01":
      return { lines: ["Opening ghostfreq_01..."], open: "win-im" };
    case "winamp":
      return { lines: ["Starting Signal Tuner..."], open: "winamp" };
    case "notepad":
    case "edit":
      return { lines: ["Opening Notepad..."], open: "win-note" };
    default:
      return { lines: ["Bad command or file name"] };
  }
}

// --- Run box -----------------------------------------------------------------

export interface RunResult {
  // A window to open, or a command to run in the MS-DOS Prompt.
  open?: string;
  dos?: string;
  // An error to show in the box instead.
  message?: string;
}

const OPENS: Record<string, string> = {
  cmd: "win-dos",
  command: "win-dos",
  dos: "win-dos",
  "ms-dos": "win-dos",
  notepad: "win-note",
  edit: "win-note",
  winamp: "winamp",
  signal: "winamp",
  tuner: "winamp",
  "signal tuner": "winamp",
  aim: "win-im",
  ghostfreq: "win-im",
  ghostfreq_01: "win-im",
  control: "win-display",
  desk: "win-display",
  display: "win-display",
  bin: "win-trash",
  "recycle bin": "win-trash",
  credits: "win-credits",
};

const DISABLED = "This program has been disabled to free up bandwidth for the signal.";
const BLOCKED: Record<string, string> = {
  winmine: DISABLED,
  sol: DISABLED,
  freecell: DISABLED,
  spider: DISABLED,
  mspaint: "Paint cannot start. All 640K is taken up by the song.",
  pbrush: "Paint cannot start. All 640K is taken up by the song.",
  calc: "Calculator is busy counting listens. It has reached 1,412.",
  regedit:
    "This operation has been cancelled due to restrictions in effect on this computer. Please contact your system administrator. (it is the dish)",
  msconfig:
    "This operation has been cancelled due to restrictions in effect on this computer. Please contact your system administrator. (it is the dish)",
  explorer: "The dial-up connection is in use. It is busy listening.",
  iexplore: "The dial-up connection is in use. It is busy listening.",
  netscape: "The dial-up connection is in use. It is busy listening.",
};

export function resolveRun(input: string): RunResult {
  const typed = input.trim();
  if (typed === "") return {};
  const name = typed.toLowerCase().replace(/\.(exe|com|bat|cpl)$/, "");
  if (name === "1420") return { open: "win-dos", dos: "1420" };
  const open = OPENS[name];
  if (open != null) return { open };
  const blocked = BLOCKED[name];
  if (blocked != null) return { message: blocked };
  return {
    message: `Cannot find the file '${typed}' (or one of its components). Make sure the path and filename are correct and that all required libraries are available.`,
  };
}
