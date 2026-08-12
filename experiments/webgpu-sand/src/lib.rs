//! Feasibility spike for a WebGPU compute-shader-based reactive sand
//! surface, evaluating whether it's worth building for real (see
//! ../README.md). Standalone crate, deliberately not wired into the main
//! sandscript app or its build — this only needs to answer "does a
//! wgpu-in-WASM compute pipeline work, and does the result look right,"
//! not ship a feature.
//!
//! Two buffers (A/B) hold a flat grid of "sand depth" floats, ping-ponged
//! each frame: a `dig` compute pass carves a soft groove wherever the ball
//! currently is, a `relax` compute pass blends each cell toward its
//! neighbors' average (approximating loose grains sliding back over time),
//! and a render pass shades the result via a normal computed from the
//! heightmap's finite differences, so grooves visibly catch light.

use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;
use wgpu::util::DeviceExt;

const GRID_W: u32 = 256;
const GRID_H: u32 = 160;

fn surface_config(format: wgpu::TextureFormat, width: u32, height: u32, alpha_mode: wgpu::CompositeAlphaMode) -> wgpu::SurfaceConfiguration {
    wgpu::SurfaceConfiguration {
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        format,
        color_space: wgpu::SurfaceColorSpace::Auto,
        width,
        height,
        present_mode: wgpu::PresentMode::Fifo,
        alpha_mode,
        view_formats: vec![],
        desired_maximum_frame_latency: 2,
    }
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct Params {
    grid_w: u32,
    grid_h: u32,
    ball_x: f32,
    ball_y: f32,
    prev_ball_x: f32,
    prev_ball_y: f32,
    dig_radius: f32,
    dig_strength: f32,
    relax_rate: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

#[wasm_bindgen]
pub struct SandSim {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    surface_format: wgpu::TextureFormat,
    width: u32,
    height: u32,

    dig_pipeline: wgpu::ComputePipeline,
    relax_pipeline: wgpu::ComputePipeline,
    render_pipeline: wgpu::RenderPipeline,

    params_buf: wgpu::Buffer,
    // height_bufs[cur] is always the most up-to-date grid; dig writes it
    // in place, relax reads it and writes height_bufs[1 - cur], then `cur`
    // flips. Bind groups are precomputed for both directions so no
    // per-frame bind group creation is needed.
    // Never read directly after init -- kept alive here so the buffers this
    // struct's bind groups reference aren't dropped for as long as SandSim
    // lives.
    #[allow(dead_code)]
    height_bufs: [wgpu::Buffer; 2],
    dig_bind_groups: [wgpu::BindGroup; 2],
    relax_bind_groups: [wgpu::BindGroup; 2], // [cur] = reads cur, writes 1-cur
    render_bind_groups: [wgpu::BindGroup; 2],
    cur: usize,
    // Grid-space position from the previous update() call, so dig() can
    // stroke the segment traveled this frame instead of only stamping the
    // current point (see dig()'s dist_to_segment for why).
    last_ball: (f32, f32),
}

#[wasm_bindgen]
pub async fn init_sim(canvas: HtmlCanvasElement) -> Result<SandSim, JsValue> {
    console_error_panic_hook::set_once();

    let width = canvas.width();
    let height = canvas.height();

    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
    let surface = instance
        .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
        .map_err(|e| JsValue::from_str(&format!("create_surface failed: {e}")))?;

    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
            apply_limit_buckets: false,
        })
        .await
        .map_err(|e| JsValue::from_str(&format!("request_adapter failed: {e}")))?;

    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor {
            label: Some("sand-sim-device"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_webgl2_defaults(),
            ..Default::default()
        })
        .await
        .map_err(|e| JsValue::from_str(&format!("request_device failed: {e}")))?;

    let caps = surface.get_capabilities(&adapter);
    let surface_format = caps.formats[0];
    surface.configure(&device, &surface_config(surface_format, width, height, caps.alpha_modes[0]));

    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("sand-shader"),
        source: wgpu::ShaderSource::Wgsl(include_str!("sand.wgsl").into()),
    });

    let cell_count = (GRID_W * GRID_H) as usize;
    let zeros = vec![0.0f32; cell_count];
    let height_bufs = [
        device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("height-a"),
            contents: bytemuck::cast_slice(&zeros),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        }),
        device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("height-b"),
            contents: bytemuck::cast_slice(&zeros),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
        }),
    ];

    let params_buf = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("params"),
        size: std::mem::size_of::<Params>() as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });

    // `dig` writes its target buffer in place -- it must NOT bind that same
    // buffer to two different storage slots in one bind group, since WebGPU's
    // validation rejects aliasing two writable bindings over the same range
    // (a real hazard rule, not a quirk) and drops the whole submission. So
    // `dig` gets its own single-buffer layout, distinct from `relax`'s
    // two-buffer ping-pong layout.
    let dig_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("dig-bgl"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: false },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    });
    let relax_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("relax-bgl"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    // Matches height_in's WGSL declaration (read_write,
                    // shared with `dig`'s entry point on the same module)
                    // even though `relax` itself only reads through it.
                    ty: wgpu::BufferBindingType::Storage { read_only: false },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 2,
                visibility: wgpu::ShaderStages::COMPUTE,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: false },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    });

    let dig_bind_groups = [0, 1].map(|i| {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("dig-bg"),
            layout: &dig_bgl,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: params_buf.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: height_bufs[i].as_entire_binding(),
                },
            ],
        })
    });
    let make_relax_bg = |label: &str, a: &wgpu::Buffer, b: &wgpu::Buffer| {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some(label),
            layout: &relax_bgl,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: params_buf.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: a.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: b.as_entire_binding(),
                },
            ],
        })
    };
    let relax_bind_groups = [
        make_relax_bg("relax-0-to-1", &height_bufs[0], &height_bufs[1]),
        make_relax_bg("relax-1-to-0", &height_bufs[1], &height_bufs[0]),
    ];

    let dig_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("dig-pl"),
        bind_group_layouts: &[Some(&dig_bgl)],
        immediate_size: 0,
    });
    let relax_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("relax-pl"),
        bind_group_layouts: &[Some(&relax_bgl)],
        immediate_size: 0,
    });
    let dig_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("dig-pipeline"),
        layout: Some(&dig_pl),
        module: &shader,
        entry_point: Some("dig"),
        compilation_options: Default::default(),
        cache: None,
    });
    let relax_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("relax-pipeline"),
        layout: Some(&relax_pl),
        module: &shader,
        entry_point: Some("relax"),
        compilation_options: Default::default(),
        cache: None,
    });

    // -- render: uniform params + one read-only storage buffer (the current
    // heightmap).
    let render_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("render-bgl"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
        ],
    });
    let render_bind_groups = [0, 1].map(|i| {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("render-bg"),
            layout: &render_bgl,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: params_buf.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: height_bufs[i].as_entire_binding(),
                },
            ],
        })
    });
    let render_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("render-pl"),
        bind_group_layouts: &[Some(&render_bgl)],
        immediate_size: 0,
    });
    let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("render-pipeline"),
        layout: Some(&render_pl),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            buffers: &[],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            targets: &[Some(surface_format.into())],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache: None,
    });

    Ok(SandSim {
        device,
        queue,
        surface,
        surface_format,
        width,
        height,
        dig_pipeline,
        relax_pipeline,
        render_pipeline,
        params_buf,
        height_bufs,
        dig_bind_groups,
        relax_bind_groups,
        render_bind_groups,
        cur: 0,
        last_ball: (GRID_W as f32 * 0.5, GRID_H as f32 * 0.5),
    })
}

#[wasm_bindgen]
impl SandSim {
    /// `ball_x`/`ball_y` in normalized [0,1] table coordinates.
    pub fn update(&mut self, ball_x: f32, ball_y: f32) {
        let bx = ball_x * GRID_W as f32;
        let by = ball_y * GRID_H as f32;
        let params = Params {
            grid_w: GRID_W,
            grid_h: GRID_H,
            ball_x: bx,
            ball_y: by,
            prev_ball_x: self.last_ball.0,
            prev_ball_y: self.last_ball.1,
            dig_radius: 6.0,
            dig_strength: 0.15,
            // At 0.06 (the original value) the groove decayed to ~2.5% of
            // its depth within one second at 60fps -- visibly "fading" as
            // reported, nothing like how long a real sand table's drawn
            // trail persists. 0.0015 decays much more gradually (~91% of
            // depth still remains after 1s, ~41% after 10s), reading as a
            // trail that persists and only slowly settles, not one that
            // vanishes shortly after the ball passes.
            relax_rate: 0.0015,
            _pad0: 0.0,
            _pad1: 0.0,
            _pad2: 0.0,
        };
        self.last_ball = (bx, by);
        self.queue
            .write_buffer(&self.params_buf, 0, bytemuck::bytes_of(&params));

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("update") });

        let workgroups_x = GRID_W.div_ceil(8);
        let workgroups_y = GRID_H.div_ceil(8);

        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("dig-pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.dig_pipeline);
            pass.set_bind_group(0, &self.dig_bind_groups[self.cur], &[]);
            pass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
        }
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("relax-pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.relax_pipeline);
            pass.set_bind_group(0, &self.relax_bind_groups[self.cur], &[]);
            pass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
        }

        self.queue.submit(std::iter::once(encoder.finish()));
        self.cur = 1 - self.cur;
    }

    pub fn render(&mut self) {
        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(f) | wgpu::CurrentSurfaceTexture::Suboptimal(f) => f,
            _ => {
                // Timeout/Occluded/Outdated/Lost/Validation -- reconfigure
                // and skip this frame rather than panic.
                self.surface
                    .configure(&self.device, &surface_config(self.surface_format, self.width, self.height, wgpu::CompositeAlphaMode::Auto));
                return;
            }
        };
        let view = frame.texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("render") });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("render-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.16,
                            g: 0.11,
                            b: 0.05,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.render_pipeline);
            pass.set_bind_group(0, &self.render_bind_groups[self.cur], &[]);
            pass.draw(0..3, 0..1);
        }
        self.queue.submit(std::iter::once(encoder.finish()));
        self.queue.present(frame);
    }
}
