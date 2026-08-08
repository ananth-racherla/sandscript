use crate::gcode::Pt;

#[derive(Clone)]
struct TurtleState {
    x: f64,
    y: f64,
    angle: f64,
}

struct Turtle {
    state: TurtleState,
    stack: Vec<TurtleState>,
    pts: Vec<Pt>,
    step: f64,
    angle_delta: f64,
}

impl Turtle {
    fn new(x: f64, y: f64, angle_deg: f64, step: f64, angle_delta_deg: f64) -> Self {
        Self {
            state: TurtleState { x, y, angle: angle_deg.to_radians() },
            stack: vec![],
            pts: vec![Pt::new(x, y)],
            step,
            angle_delta: angle_delta_deg.to_radians(),
        }
    }

    fn forward(&mut self) {
        self.state.x += self.step * self.state.angle.cos();
        self.state.y += self.step * self.state.angle.sin();
        self.pts.push(Pt::new(self.state.x, self.state.y));
    }

    fn turn_left(&mut self)  { self.state.angle += self.angle_delta; }
    fn turn_right(&mut self) { self.state.angle -= self.angle_delta; }
    fn push(&mut self) { self.stack.push(self.state.clone()); }
    fn pop(&mut self) {
        if let Some(s) = self.stack.pop() {
            self.state = s;
            self.pts.push(Pt::new(self.state.x, self.state.y));
        }
    }
}

fn expand(axiom: &str, rules: &[(&str, &str)], depth: u32) -> String {
    let mut s = axiom.to_string();
    for _ in 0..depth {
        let mut next = String::with_capacity(s.len() * 4);
        for ch in s.chars() {
            let ch_str = &ch.to_string();
            let replacement = rules.iter()
                .find(|(from, _)| *from == ch_str)
                .map(|(_, to)| *to)
                .unwrap_or(ch_str.as_str());
            next.push_str(replacement);
        }
        s = next;
    }
    s
}

fn draw(sequence: &str, angle_delta: f64, step: f64) -> Vec<Pt> {
    let mut t = Turtle::new(0.0, 0.0, 0.0, step, angle_delta);
    for ch in sequence.chars() {
        match ch {
            'F' | 'G' | 'A' | 'B' | 'X' | 'Y' => t.forward(),
            '+' => t.turn_left(),
            '-' => t.turn_right(),
            '[' => t.push(),
            ']' => t.pop(),
            _ => {}
        }
    }
    t.pts
}

/// Hilbert curve (space-filling, square)
pub fn hilbert(depth: u32) -> Vec<Pt> {
    let rules = &[("A", "+BF-AFA-FB+"), ("B", "-AF+BFB+FA-")];
    let seq = expand("A", rules, depth);
    draw(&seq, 90.0, 1.0)
}

/// Gosper curve (fills hexagonal area)
pub fn gosper(depth: u32) -> Vec<Pt> {
    let rules = &[
        ("A", "A-B--B+A++AA+B-"),
        ("B", "+A-BB--B-A++A+B"),
    ];
    let seq = expand("A", rules, depth);
    draw(&seq, 60.0, 1.0)
}

/// Sierpinski triangle
pub fn sierpinski(depth: u32) -> Vec<Pt> {
    let rules = &[("A", "B-A-B"), ("B", "A+B+A")];
    let seq = expand("A", rules, depth);
    draw(&seq, 60.0, 1.0)
}

/// Dragon curve
pub fn dragon(depth: u32) -> Vec<Pt> {
    let rules = &[("X", "X+YF+"), ("Y", "-FX-Y")];
    let seq = expand("FX", rules, depth);
    draw(&seq, 90.0, 1.0)
}

/// Koch snowflake
pub fn koch(depth: u32) -> Vec<Pt> {
    let rules = &[("F", "F+F--F+F")];
    let seq = expand("F--F--F", rules, depth);
    draw(&seq, 60.0, 1.0)
}

/// Plant (branching, bracket L-system)
pub fn plant(depth: u32) -> Vec<Pt> {
    let rules = &[
        ("X", "F+[[X]-X]-F[-FX]+X"),
        ("F", "FF"),
    ];
    let seq = expand("X", rules, depth);
    let mut t = Turtle::new(0.0, 0.0, 90.0, 1.0, 25.0);
    for ch in seq.chars() {
        match ch {
            'F' => t.forward(),
            '+' => t.turn_left(),
            '-' => t.turn_right(),
            '[' => t.push(),
            ']' => t.pop(),
            _ => {}
        }
    }
    t.pts
}
