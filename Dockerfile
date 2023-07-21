FROM denoland/deno:alpine-1.35.1

# Install system deps
RUN apk add curl

# The port that your application listens to.
EXPOSE 8000

WORKDIR /app

# Cache the dependencies as a layer (the following two steps are re-run only when deps.ts is modified).
# Ideally cache deps.ts will download and compile _all_ external files used in main.ts.
# COPY deps.ts .
# RUN deno cache deps.ts

# These steps will be re-run upon each file change in your working directory:
COPY . .
# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache src/main.ts

# Prefer not to run as root.
USER deno

CMD ["run", "--allow-net", "--allow-read", "--allow-env", "--allow-run", "src/main.ts"]
