use anyhow::Result;
use clap::{Parser, Subcommand, ValueEnum};
use sandscript::{
    gen_rose_gcode, gen_lissajous_gcode, gen_spirograph_gcode,
    gen_spiral_gcode, gen_lsystem_gcode, gen_flowfield_gcode, gen_from_svg_gcode,
};
use std::fs;
use std::path::PathBuf;

#[derive(Parser)]
#[command(
    name = "sandscript",
    about = "Generate G-code patterns for a sand table (515×320 mm)",
    long_about = "Generate G-code for a kinetic sand table.\n\
                  Run 'sandscript examples' to see interesting parameter combinations.\n\
                  Open index.html in a browser (via 'python3 -m http.server 8080') for the interactive web UI."
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Generate a mathematical pattern
    Pattern {
        #[command(subcommand)]
        kind: PatternKind,
    },
    /// Show interesting example commands for each pattern type
    Examples,
    /// Convert an SVG outline into a sand-table path
    FromSvg {
        input: PathBuf,
        #[arg(short, long)]
        output: PathBuf,
        #[arg(long, default_value_t = 0.5)]
        spu: f64,
        #[arg(long, default_value_t = 0.05)]
        margin: f64,
        #[arg(long, default_value_t = 2000)]
        feedrate: u32,
    },
}

#[derive(Subcommand)]
enum PatternKind {
    Rose {
        #[arg(long, default_value_t = 5)]
        n: u32,
        #[arg(long, default_value_t = 1)]
        d: u32,
        #[arg(long, default_value_t = 8000)]
        steps: usize,
        #[arg(long, default_value_t = 0.9)]
        scale: f64,
        #[arg(short, long)]
        output: PathBuf,
        #[arg(long, default_value_t = 2000)]
        feedrate: u32,
    },
    Lissajous {
        #[arg(long, default_value_t = 3)]
        a: u32,
        #[arg(long, default_value_t = 2)]
        b: u32,
        #[arg(long, default_value_t = 0.5)]
        delta: f64,
        #[arg(long, default_value_t = 8000)]
        steps: usize,
        #[arg(long, default_value_t = 0.9)]
        scale: f64,
        #[arg(short, long)]
        output: PathBuf,
        #[arg(long, default_value_t = 2000)]
        feedrate: u32,
    },
    Spirograph {
        #[arg(long, default_value_t = 5.0)]
        big_r: f64,
        #[arg(long, default_value_t = 3.0)]
        small_r: f64,
        #[arg(long, default_value_t = 5.0)]
        pen_d: f64,
        #[arg(long, default_value = "hypo")]
        mode: SpiroMode,
        #[arg(long, default_value_t = 20000)]
        steps: usize,
        #[arg(long, default_value_t = 0.9)]
        scale: f64,
        #[arg(short, long)]
        output: PathBuf,
        #[arg(long, default_value_t = 2000)]
        feedrate: u32,
    },
    Spiral {
        #[arg(long, default_value_t = 40.0)]
        turns: f64,
        #[arg(long, default_value_t = 0.025)]
        gap: f64,
        #[arg(long, default_value_t = 30000)]
        steps: usize,
        #[arg(long, default_value_t = 0.9)]
        scale: f64,
        #[arg(short, long)]
        output: PathBuf,
        #[arg(long, default_value_t = 2000)]
        feedrate: u32,
    },
    Lsystem {
        #[arg(long, default_value = "hilbert")]
        preset: LSystemPreset,
        #[arg(long, default_value_t = 5)]
        depth: u32,
        #[arg(long, default_value_t = 0.9)]
        scale: f64,
        #[arg(short, long)]
        output: PathBuf,
        #[arg(long, default_value_t = 2000)]
        feedrate: u32,
    },
    Flowfield {
        #[arg(long, default_value_t = 42)]
        seed: u32,
        #[arg(long, default_value_t = 200)]
        particles: usize,
        #[arg(long, default_value_t = 300)]
        steps: usize,
        #[arg(long, default_value_t = 0.01)]
        step_size: f64,
        #[arg(long, default_value_t = 2.0)]
        noise_scale: f64,
        #[arg(long, default_value_t = 2.0)]
        strength: f64,
        #[arg(long, default_value_t = 0.9)]
        scale: f64,
        #[arg(short, long)]
        output: PathBuf,
        #[arg(long, default_value_t = 2000)]
        feedrate: u32,
    },
}

#[derive(Clone, ValueEnum)]
enum SpiroMode { Hypo, Epi }

#[derive(Clone, ValueEnum)]
enum LSystemPreset { Hilbert, Gosper, Sierpinski, Dragon, Koch, Plant }

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Examples => print_examples(),

        Command::FromSvg { input, output, spu, margin, feedrate } => {
            let text = fs::read_to_string(&input)?;
            let gcode = gen_from_svg_gcode(&text, spu, margin, feedrate)?;
            fs::write(&output, gcode)?;
            eprintln!("Wrote {}", output.display());
        }

        Command::Pattern { kind } => {
            let (name, gcode) = match kind {
                PatternKind::Rose { n, d, steps, scale, output, feedrate } =>
                    (output, gen_rose_gcode(n, d, steps, scale, feedrate)?),

                PatternKind::Lissajous { a, b, delta, steps, scale, output, feedrate } =>
                    (output, gen_lissajous_gcode(a, b, delta, steps, scale, feedrate)?),

                PatternKind::Spirograph { big_r, small_r, pen_d, mode, steps, scale, output, feedrate } =>
                    (output, gen_spirograph_gcode(big_r, small_r, pen_d, matches!(mode, SpiroMode::Epi), steps, scale, feedrate)?),

                PatternKind::Spiral { turns, gap, steps, scale, output, feedrate } =>
                    (output, gen_spiral_gcode(turns, gap, steps, scale, feedrate)?),

                PatternKind::Lsystem { preset, depth, scale, output, feedrate } => {
                    let preset_str = match preset {
                        LSystemPreset::Hilbert    => "hilbert",
                        LSystemPreset::Gosper     => "gosper",
                        LSystemPreset::Sierpinski => "sierpinski",
                        LSystemPreset::Dragon     => "dragon",
                        LSystemPreset::Koch       => "koch",
                        LSystemPreset::Plant      => "plant",
                    };
                    (output, gen_lsystem_gcode(preset_str, depth, scale, feedrate)?)
                }

                PatternKind::Flowfield { seed, particles, steps, step_size, noise_scale, strength, scale, output, feedrate } =>
                    (output, gen_flowfield_gcode(seed, particles, steps, step_size, noise_scale, strength, scale, feedrate)?),
            };
            fs::write(&name, gcode)?;
            eprintln!("Wrote {}", name.display());
        }
    }
    Ok(())
}

fn print_examples() {
    println!(r#"
sandscript examples — run 'sandscript pattern <TYPE> --help' for all options.
Open index.html in a browser for the interactive GUI.

  sandscript pattern rose --n 5 -o rose5.gcode
  sandscript pattern rose --n 7 --d 2 -o rose7_2.gcode
  sandscript pattern lissajous --a 3 --b 2 --delta 0.5 -o lissa.gcode
  sandscript pattern spirograph --big-r 5 --small-r 3 --pen-d 5 -o spiro.gcode
  sandscript pattern spiral --turns 50 -o spiral.gcode
  sandscript pattern lsystem --preset hilbert --depth 6 -o hilbert.gcode
  sandscript pattern lsystem --preset gosper --depth 4 -o gosper.gcode
  sandscript pattern flowfield --seed 42 --particles 200 --steps 300 -o flow.gcode
  sandscript from-svg dog.svg -o dog.gcode
"#);
}
