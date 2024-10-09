FROM node:22-alpine
RUN npm install -g npm@6.14.7

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN mkdir -p /var/www/state-manager
WORKDIR /var/www/state-manager
COPY . /var/www/state-manager

RUN corepack enable
RUN corepack prepare pnpm@9.11.0 --activate

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
CMD pnpm run build && pnpm run start:prod
