FROM node:14

RUN apt-get update
RUN apt-get -y install graphicsmagick
RUN npm install forever -g

CMD ["bash"]