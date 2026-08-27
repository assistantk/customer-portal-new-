async function run() {
  const res = await fetch('http://localhost:4000/api/customers');
  const data = await res.json();
  console.log(data);
}
run();
