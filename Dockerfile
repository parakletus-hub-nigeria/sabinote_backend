# Use the slim Debian image for native Prisma compatibility
FROM node:22-slim

RUN apt-get update -y && apt-get install -y openssl

# Set an absolute working directory
WORKDIR /usr/src/app

# Copy package definitions and the Prisma schema first
# This leverages Docker caching so dependencies don't reinstall on every code change
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate the Prisma engine for Linux
RUN npm ci
RUN npx prisma generate

# Copy the rest of the application codej
COPY . .

# Build the NestJS application into the /dist folder
RUN npm run build

# Expose the standard port
EXPOSE 8080

# Apply any pending DB migrations, then start the compiled production server.
# migrate deploy runs at container startup (not build time) so it has the live
# DATABASE_URL; it only applies already-created migrations and never generates
# new ones. If a migration fails the container won't boot — fail-fast is safer
# than serving against a half-migrated schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]