import axios from "axios";

const client = axios.create({
  baseURL: "",
  timeout: 10000,
});

export default client;
