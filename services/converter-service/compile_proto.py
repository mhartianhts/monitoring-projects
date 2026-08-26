import os
import sys
import subprocess

def compile():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    proto_dir = os.path.join(base_dir, "proto")
    proto_file = os.path.join(proto_dir, "converter.proto")
    output_dir = os.path.join(base_dir, "src", "generated")

    os.makedirs(output_dir, exist_ok=True)
    init_file = os.path.join(output_dir, "__init__.py")
    if not os.path.exists(init_file):
        with open(init_file, "w") as f:
            pass

    cmd = [
        sys.executable,
        "-m", "grpc_tools.protoc",
        f"-I{proto_dir}",
        f"--python_out={output_dir}",
        f"--grpc_python_out={output_dir}",
        proto_file
    ]

    print(f"Mengompilasi protobuf: {' '.join(cmd)}")
    result = subprocess.run(cmd, check=True)
    print("Kompilasi protobuf selesai dengan sukses.")

    # Fix import path pada generated converter_pb2_grpc.py agar relative import bekerja baik
    grpc_gen_file = os.path.join(output_dir, "converter_pb2_grpc.py")
    if os.path.exists(grpc_gen_file):
        with open(grpc_gen_file, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Replace `import converter_pb2 as converter__pb2` with relative import or generated package import
        if "import converter_pb2 as converter__pb2" in content and "from . import converter_pb2" not in content:
            content = content.replace(
                "import converter_pb2 as converter__pb2",
                "try:\n    from . import converter_pb2 as converter__pb2\nexcept ImportError:\n    import converter_pb2 as converter__pb2"
            )
            with open(grpc_gen_file, "w", encoding="utf-8") as f:
                f.write(content)

if __name__ == "__main__":
    compile()
