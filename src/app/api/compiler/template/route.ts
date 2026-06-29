import { NextResponse } from 'next/server'

export async function GET() {
  const boilerplate = `void setup() {
  // Put your setup code here, to run once:

}

void loop() {
  // Put your main code here, to run repeatedly:

}
`

  return new NextResponse(boilerplate, {
    headers: { 'Content-Type': 'text/plain' }
  })
}
