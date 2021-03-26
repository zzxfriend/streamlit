FROM gitpod/workspace-full

# Install custom tools, runtime, etc.
RUN sudo apt-get update \
    && sudo apt-get install -y graphviz python3-distutils protobuf-compiler libgconf-2-4 \
    && sudo rm -rf /var/lib/apt/lists/*
